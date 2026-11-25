"""Worker que entrega os pedidos do kanbagent ao Hermes (hoje: escrever a proposta de um card).

Roda fora do Flask: o site dispara `python -m hermes_dashboard.kanbagent_hermes` quando um pedido entra
na fila, e o crontab chama o mesmo comando de tempos em tempos para pegar o que sobrou (deploy no meio,
queda). Um de cada vez (trava em arquivo). O Hermes grava pela API do kanbagent com a skill
`kanbagent-proposta`, que leva o card para "Em revisão"; isso fecha o pedido sozinho.
"""
import json
import logging
import os
import subprocess
import sys
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path

from . import config
from . import kanbagent as kb

LOG = logging.getLogger(__name__)
HERMES_BIN = Path(os.getenv("KANBAGENT_HERMES_BIN", str(config.HERMES_HOME / "hermes-agent/venv/bin/hermes")))
LOCK_PATH = config.HERMES_HOME / "kanbagent-hermes.lock"
TIMEOUT = 15 * 60   # abaixo do JOB_STALE (20 min) do domínio

PROMPT = """Card {id} do kanbagent ("{titulo}") acabou de ser movido para Proposta pelo Sato, na página.

Use a skill kanbagent-proposta para escrever a proposta deste card agora e grave com
`~/.hermes/scripts/kanbagent.sh proposal {id} ARQUIVO` (isso leva o card para "Em revisão").

Antes, leia o card inteiro (`~/.hermes/scripts/kanbagent.sh card {id}`): ideia original, comentários e
cada volta (stage_change com texto). Se já existe proposta, reescreva em cima dela levando em conta tudo
o que o Sato escreveu depois. Ninguém vai responder perguntas nesta execução: dúvidas vão na seção
"Dúvidas" da proposta. Trabalhe só neste card."""


def describe(event):
    """Linha curta de progresso a partir de um evento `stream-json` do Hermes (ou None)."""
    if event.get("type") != "tool_use":
        return None
    name, data = event.get("name") or "ferramenta", event.get("input") or {}
    detail = data.get("command") or data.get("path") or data.get("query") or data.get("url") or ""
    detail = " ".join(str(detail).split())
    if "kanbagent.sh proposal" in detail:
        return "gravando a proposta"
    if "kanbagent.sh card" in detail:
        return "lendo o card"
    if "estilo-sato" in detail:
        return "lendo o estilo do Sato"
    return f"{name}: {detail[:90]}" if detail else name


@contextmanager
def single_worker(lock_path=None):
    """Só um worker por vez; os outros saem na hora (o que está rodando esvazia a fila)."""
    lock_path = lock_path or LOCK_PATH
    try:
        import fcntl
    except ImportError:   # Windows (desenvolvimento): sem trava
        yield True
        return
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "w") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            yield False
            return
        yield True


def run_hermes(prompt, on_event, timeout=TIMEOUT):
    """Roda o Hermes com a skill de proposta; devolve (código de saída, texto final ou erro)."""
    if not HERMES_BIN.exists():
        return 127, f"Hermes não encontrado em {HERMES_BIN}."
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as handle:
        handle.write(prompt)
        query = handle.name
    command = [str(HERMES_BIN), "chat", "--query-file", query, "--oneshot", "-s", "kanbagent-proposta",
               "--format", "stream-json", "--source", "tool", "--max-turns", "40"]
    result = {"code": None, "text": ""}
    try:
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, cwd=str(Path.home()))
        # O Hermes pode ficar mudo; o relógio mata o processo e o loop de leitura termina.
        watchdog = threading.Timer(timeout, process.kill)
        watchdog.start()
        try:
            for line in process.stdout:
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                if event.get("type") == "result":
                    result.update(code=event.get("exit_code"), text=event.get("error") or event.get("text") or "")
                else:
                    on_event(event)
            process.wait(timeout=30)
        finally:
            expired = not watchdog.is_alive()
            watchdog.cancel()
        if expired and result["code"] is None:
            return 124, "O Hermes passou de 15 minutos e foi parado."
        code = process.returncode if result["code"] is None else result["code"]
        return code, result["text"]
    finally:
        os.unlink(query)


def handle(job, runner=run_hermes):
    item = kb.card(job["card_id"])
    last = {"text": None}

    def on_event(event):
        text = describe(event)
        if text and text != last["text"]:
            last["text"] = text
            kb.job_progress(job["id"], text)

    try:
        code, text = runner(PROMPT.format(id=item["id"], titulo=item["titulo"]), on_event)
    except Exception as error:   # o pedido nunca fica preso por erro nosso
        LOG.exception("kanbagent: Hermes falhou no card %s", item["id"])
        code, text = 1, str(error)
    # A skill leva o card para revisão; isso já fechou o pedido. Se não levou, deu errado.
    if kb.job(job["id"])["status"] in ("queued", "running"):
        reason = text if code else "O Hermes terminou sem gravar a proposta."
        kb.finish_job(job["id"], error=(reason or f"Hermes saiu com código {code}.").strip()[-400:])


def drain(runner=run_hermes):
    """Atende a fila até esvaziar. Devolve quantos pedidos pegou."""
    done = 0
    with single_worker() as mine:
        if not mine:
            return 0
        while (job := kb.claim_job("proposta")) is not None:
            handle(job, runner)
            done += 1
    return done


def spawn(module="hermes_dashboard.kanbagent_hermes"):
    """Dispara o worker fora do processo do site (unidade própria do systemd quando dá, para não
    morrer junto num restart); sem systemd, um processo solto. Nunca bloqueia a requisição."""
    worker = [sys.executable, "-m", module]
    root = str(Path(__file__).resolve().parent.parent)
    options = dict(cwd=root, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        subprocess.Popen(["systemd-run", "--user", "--collect", "--quiet", f"--working-directory={root}",
                          *worker], **options)
    except OSError:
        try:
            subprocess.Popen(worker, start_new_session=True, **options)
        except OSError:
            LOG.warning("kanbagent: não deu para disparar o worker; o crontab pega o pedido depois")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(f"kanbagent-hermes: {drain()} pedido(s)")
