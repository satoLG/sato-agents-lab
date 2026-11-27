"""kanbagent: domínio do kanban pessoal do Sato, com banco próprio (ADR 0009).

Sem Flask: rotas, API e página chamam estas funções. `events` é a fonte da
verdade do tempo e só recebe INSERT; `cards.etapa_atual` é cache do último
`stage_change`, gravado na mesma transação. Desenho em docs/kanbagent.md.
"""
import os
import re
import sqlite3
import uuid
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config
from . import kanbagent_spec as spec
from . import kanbagent_team as team

DB_PATH = Path(os.getenv("KANBAGENT_DB_PATH", str(config.HERMES_HOME / "kanbagent.sqlite3")))

STAGES = ("ideia", "proposta", "revisao", "aprovado", "execucao", "revisao_codigo", "entregue", "descartado")
TERMINAL = {"entregue", "descartado"}
MAIN_PATH = ("ideia", "proposta", "revisao", "aprovado", "execucao", "revisao_codigo", "entregue")
EVENT_KINDS = ("stage_change", "comment", "link_added", "proposal_updated", "repo_changed", "ref_added", "artifact_added")
# "hermes" é o Sato Agent principal; "claude" ficou nos eventos de antes do time (ADR 0014).
AUTHORS = ("sato", "hermes", "github-sync", "claude", *team.ORDER)
EXECUTORS = ("claude", *team.CLAUDE_AGENTS)   # quem pode gravar o repositório criado na execução

_SCHEMA = (
    """CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, nome TEXT NOT NULL,
        descricao TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL, arquivado_em TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS repos (
        id INTEGER PRIMARY KEY, full_name TEXT NOT NULL UNIQUE
    )""",
    """CREATE TABLE IF NOT EXISTS project_repos (
        project_id INTEGER NOT NULL REFERENCES projects(id),
        repo_id INTEGER NOT NULL REFERENCES repos(id),
        PRIMARY KEY (project_id, repo_id)
    )""",
    """CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
        repo_id INTEGER REFERENCES repos(id), titulo TEXT NOT NULL,
        ideia_original TEXT NOT NULL, proposta TEXT NOT NULL DEFAULT '',
        etapa_atual TEXT NOT NULL, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS card_links (
        id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id),
        repo_id INTEGER REFERENCES repos(id), numero INTEGER, url TEXT NOT NULL,
        estado TEXT, criado_em TEXT NOT NULL
    )""",
    # Referências da ideia (links e arquivos anexos) que seguem com o card até a execução.
    """CREATE TABLE IF NOT EXISTS card_refs (
        id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('link', 'arquivo')), titulo TEXT NOT NULL DEFAULT '',
        url TEXT, arquivo TEXT, tamanho INTEGER, criado_em TEXT NOT NULL
    )""",
    # Artefatos que a execução devolve (imagem, documento...): abrem no card, fora do repositório.
    """CREATE TABLE IF NOT EXISTS card_artifacts (
        id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id),
        nome TEXT NOT NULL, arquivo TEXT NOT NULL, tamanho INTEGER NOT NULL, criado_em TEXT NOT NULL
    )""",
    # Uma linha por chamada do Claude (planejar, executar tarefa, revisar): base do custo por card.
    # cost_usd é o equivalente em API que a CLI informa, não o desconto exato da assinatura.
    """CREATE TABLE IF NOT EXISTS card_runs (
        id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id), job_id INTEGER,
        kind TEXT NOT NULL, model TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0,
        turns INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL
    )""",
    # Atenção do Sato: segundos com o card aberto, visível e ativo, por etapa (ver `add_attention`).
    """CREATE TABLE IF NOT EXISTS card_attention (
        card_id INTEGER NOT NULL REFERENCES cards(id), stage TEXT NOT NULL,
        seconds REAL NOT NULL DEFAULT 0, last_ping TEXT, PRIMARY KEY (card_id, stage)
    )""",
    """CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id),
        kind TEXT NOT NULL, from_stage TEXT, to_stage TEXT, author TEXT NOT NULL,
        text TEXT, occurred_at TEXT NOT NULL
    )""",
    # Pedidos ao Hermes (hoje: escrever a proposta). Enquanto um está aberto o card fica travado
    # para o Sato; o worker (kanbagent_hermes.py) pega da fila e anota o progresso.
    """CREATE TABLE IF NOT EXISTS agent_jobs (
        id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id), kind TEXT NOT NULL,
        status TEXT NOT NULL, requested_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
        progress TEXT NOT NULL DEFAULT '', error TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS agent_jobs_card ON agent_jobs(card_id, id)",
    "CREATE INDEX IF NOT EXISTS events_card ON events(card_id, occurred_at, id)",
    "CREATE INDEX IF NOT EXISTS cards_stage ON cards(etapa_atual)",
    # Defesa no próprio banco: eventos são imutáveis (regra 1 do docs/kanbagent.md).
    """CREATE TRIGGER IF NOT EXISTS events_append_only_update BEFORE UPDATE ON events
        BEGIN SELECT RAISE(ABORT, 'kanbagent: events só recebe INSERT'); END""",
    """CREATE TRIGGER IF NOT EXISTS events_append_only_delete BEFORE DELETE ON events
        BEGIN SELECT RAISE(ABORT, 'kanbagent: events só recebe INSERT'); END""",
)


class InvalidTransition(ValueError):
    """Mudança de etapa fora do ciclo do card (a API responde 409)."""


class NotFound(LookupError):
    """Projeto, repositório ou card inexistente."""


# Voltas permitidas. Antes da execução a proposta pode ir e voltar; depois que a execução começa,
# só existe o ciclo execução <-> revisão de código até entregar (ou descartar).
RETURNS = {("proposta", "ideia"), ("revisao", "ideia"), ("revisao", "proposta"), ("revisao_codigo", "execucao")}
# Voltas que pedem comentário: é o que o Hermes (ou o worker) usa para refazer.
NEEDS_TEXT = {("revisao", "proposta"), ("revisao", "ideia"), ("revisao_codigo", "execucao")}


def can_transition(from_stage, to_stage):
    """Única regra de transições, usada pela página, pela API e pelo sync."""
    if from_stage not in STAGES or to_stage not in STAGES:
        return False
    if to_stage == "descartado":
        return from_stage not in TERMINAL
    if (from_stage, to_stage) in RETURNS:
        return True
    index = MAIN_PATH.index(from_stage) if from_stage in MAIN_PATH else -1
    return 0 <= index < len(MAIN_PATH) - 1 and MAIN_PATH[index + 1] == to_stage


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _iso(value):
    if value is None:
        return _now()
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise ValueError("Datas do kanbagent precisam de fuso (UTC).")
        return value.astimezone(timezone.utc).isoformat(timespec="seconds")
    return _parse(value).isoformat(timespec="seconds")


def _parse(value):
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("Datas do kanbagent precisam de fuso (UTC).")
    return parsed.astimezone(timezone.utc)


def _connection():
    DB_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=FULL")
    conn.execute("PRAGMA foreign_keys=ON")
    with _transaction(conn):
        for statement in _SCHEMA:
            conn.execute(statement)
        # Migrações: só ALTER TABLE ... ADD COLUMN, checando PRAGMA table_info antes.
        link_columns = {column[1] for column in conn.execute("PRAGMA table_info(card_links)")}
        if "tipo" not in link_columns:
            conn.execute("ALTER TABLE card_links ADD COLUMN tipo TEXT NOT NULL DEFAULT 'issue'")
        if "atualizado_em" not in link_columns:
            conn.execute("ALTER TABLE card_links ADD COLUMN atualizado_em TEXT")
        job_columns = {column[1] for column in conn.execute("PRAGMA table_info(agent_jobs)")}
        if "heartbeat_at" not in job_columns:
            conn.execute("ALTER TABLE agent_jobs ADD COLUMN heartbeat_at TEXT")
        if "result" not in job_columns:
            conn.execute("ALTER TABLE agent_jobs ADD COLUMN result TEXT")
        card_columns = {column[1] for column in conn.execute("PRAGMA table_info(cards)")}
        if "novo_repo" not in card_columns:   # repositório que o executor vai criar (owner/nome)
            conn.execute("ALTER TABLE cards ADD COLUMN novo_repo TEXT")
            conn.execute("ALTER TABLE cards ADD COLUMN novo_repo_publico INTEGER NOT NULL DEFAULT 0")
    if DB_PATH.exists():
        os.chmod(DB_PATH, 0o600)
    return conn


@contextmanager
def _transaction(conn):
    """BEGIN IMMEDIATE ... COMMIT; qualquer erro desfaz tudo e propaga."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def _insert_event(conn, card_id, kind, author, *, from_stage=None, to_stage=None, text=None, occurred_at=None):
    if kind not in EVENT_KINDS:
        raise ValueError(f"Tipo de evento desconhecido: {kind!r}.")
    if author not in AUTHORS:
        raise ValueError(f"Autor desconhecido: {author!r}.")
    occurred = _iso(occurred_at)
    conn.execute(
        "INSERT INTO events (card_id, kind, from_stage, to_stage, author, text, occurred_at) VALUES (?,?,?,?,?,?,?)",
        (card_id, kind, from_stage, to_stage, author, text, occurred))
    return occurred


def _card(conn, card_id):
    row = conn.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
    if row is None:
        raise NotFound(f"Card {card_id} não existe.")
    return row


def create_project(slug, nome, descricao=""):
    if not slug or not nome:
        raise ValueError("Projeto precisa de slug e nome.")
    with closing(_connection()) as conn, _transaction(conn):
        cursor = conn.execute("INSERT INTO projects (slug, nome, descricao, criado_em) VALUES (?,?,?,?)",
                              (slug, nome, descricao, _now()))
        return cursor.lastrowid


REPO_NAME = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$")
# Até a proposta ser aprovada o card pode trocar de repositório; depois ele é fixo.
REPO_EDITABLE = ("ideia", "proposta", "revisao")


def _check_repo(full_name):
    full_name = (full_name or "").strip()
    if not REPO_NAME.match(full_name) or full_name.endswith((".", ".git")):
        raise ValueError("Repositório precisa estar no formato owner/repo.")
    return full_name


def _repo_id(conn, full_name, project_id=None):
    """Id do repositório (cria a linha se preciso) e liga ao projeto, se houver."""
    full_name = _check_repo(full_name)
    conn.execute("INSERT OR IGNORE INTO repos (full_name) VALUES (?)", (full_name,))
    repo_id = conn.execute("SELECT id FROM repos WHERE full_name=?", (full_name,)).fetchone()[0]
    if project_id is not None:
        conn.execute("INSERT OR IGNORE INTO project_repos (project_id, repo_id) VALUES (?,?)", (project_id, repo_id))
    return repo_id


def add_repo_to_project(project_id, full_name):
    """Liga `owner/repo` ao projeto (cria o repo se preciso); devolve o id do repo. Repetir não duplica."""
    with closing(_connection()) as conn, _transaction(conn):
        if conn.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone() is None:
            raise NotFound(f"Projeto {project_id} não existe.")
        return _repo_id(conn, full_name, project_id)


def _repo_choice(conn, project_id, repo_id, repo, novo_repo):
    """(repo_id, novo_repo) a partir do que veio do formulário: id, `owner/repo` existente ou repo a criar."""
    if novo_repo:
        if repo or repo_id:
            raise ValueError("Escolha um repositório existente ou um novo, não os dois.")
        novo_repo = _check_repo(novo_repo)
        if conn.execute("SELECT 1 FROM repos WHERE full_name=?", (novo_repo,)).fetchone():
            raise ValueError(f"{novo_repo} já existe; escolha na lista.")
        return None, novo_repo
    if repo:
        return _repo_id(conn, repo, project_id), None
    if repo_id is not None:
        if conn.execute("SELECT 1 FROM repos WHERE id=?", (repo_id,)).fetchone() is None:
            raise NotFound(f"Repositório {repo_id} não existe.")
        if project_id is not None:
            conn.execute("INSERT OR IGNORE INTO project_repos (project_id, repo_id) VALUES (?,?)", (project_id, repo_id))
    return repo_id, None


def create_card(titulo, ideia_original, author, project_id=None, repo_id=None, occurred_at=None,
                repo=None, novo_repo=None, publico=False):
    """Grava o card em `ideia` com o evento inicial `None → ideia`, na mesma transação.

    O repositório pode ser qualquer um do GitHub (`repo` = owner/repo, entra no projeto sozinho) ou um
    repositório novo (`novo_repo`), que o executor cria antes de começar.
    """
    if not titulo or not ideia_original:
        raise ValueError("Card precisa de título e ideia original.")
    with closing(_connection()) as conn, _transaction(conn):
        if project_id is not None and conn.execute(
                "SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone() is None:
            raise NotFound(f"Projeto {project_id} não existe.")
        repo_id, novo_repo = _repo_choice(conn, project_id, repo_id, repo, novo_repo)
        occurred = _iso(occurred_at)
        cursor = conn.execute(
            "INSERT INTO cards (project_id, repo_id, titulo, ideia_original, etapa_atual, criado_em, atualizado_em,"
            " novo_repo, novo_repo_publico) VALUES (?,?,?,?,?,?,?,?,?)",
            (project_id, repo_id, titulo, ideia_original, "ideia", occurred, occurred, novo_repo, int(bool(publico))))
        _insert_event(conn, cursor.lastrowid, "stage_change", author, to_stage="ideia", occurred_at=occurred)
        return cursor.lastrowid


def repo_editable(row):
    """O Sato troca o repositório até a proposta ser aprovada. Um card aprovado SEM repositório ainda
    pode receber um (ou "novo") enquanto espera na fila: sem isso ele nunca executaria."""
    return row["etapa_atual"] in REPO_EDITABLE or (
        row["etapa_atual"] == "aprovado" and not row["repo_id"] and not row["novo_repo"])


def set_repo(card_id, author, repo=None, novo_repo=None, publico=False):
    """Troca o repositório do card (ver `repo_editable`). O executor (`claude`) usa para gravar o
    repositório que acabou de criar."""
    with closing(_connection()) as conn, _transaction(conn):
        row = _card(conn, card_id)
        if author not in EXECUTORS and not repo_editable(row):
            raise InvalidTransition("O repositório fica fixo depois que a proposta é aprovada.")
        if author == "sato" and _open_job(conn, card_id):
            raise InvalidTransition(LOCKED)
        repo_id, novo = _repo_choice(conn, row["project_id"], None, repo, novo_repo)
        if repo_id is None and novo is None:
            raise ValueError("Escolha um repositório.")
        conn.execute("UPDATE cards SET repo_id=?, novo_repo=?, novo_repo_publico=? WHERE id=?",
                     (repo_id, novo, int(bool(publico)) if novo else 0, card_id))
        label = repo or f"{novo} (novo, {'público' if publico else 'privado'})"
        _insert_event(conn, card_id, "repo_changed", author, text=label)


# --- referências (links e arquivos que seguem com o card) ------------------------------------------

def _files_dir():
    return DB_PATH.parent / "kanbagent-files"   # ao lado do banco (os testes trocam o DB_PATH)


MAX_FILE = 20 * 1024 * 1024
REFS_EDITABLE = ("ideia", "proposta", "revisao")


def add_ref_link(card_id, url, author, titulo=""):
    url = (url or "").strip()
    if not re.match(r"^https?://\S+$", url) or len(url) > 1000:
        raise ValueError("Use um link http(s) completo.")
    return _add_ref(card_id, author, "link", titulo.strip()[:200], url=url)


def add_ref_file(card_id, author, nome, data):
    """Guarda o anexo em FILES_DIR/<card>/ e registra a referência. `data` são os bytes."""
    if not data:
        raise ValueError("Arquivo vazio.")
    if len(data) > MAX_FILE:
        raise ValueError("Arquivo passa de 20 MB.")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", os.path.basename(nome or "arquivo")).strip("-.")[:120] or "arquivo"
    folder = _files_dir() / str(card_id)
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex[:12]}-{safe}"
    (folder / stored).write_bytes(data)
    try:
        return _add_ref(card_id, author, "arquivo", safe, arquivo=f"{card_id}/{stored}", tamanho=len(data))
    except Exception:
        (folder / stored).unlink(missing_ok=True)
        raise


def _add_ref(card_id, author, tipo, titulo, url=None, arquivo=None, tamanho=None):
    with closing(_connection()) as conn, _transaction(conn):
        row = _card(conn, card_id)
        if author == "sato" and row["etapa_atual"] not in REFS_EDITABLE:
            raise InvalidTransition("Referências entram até a proposta ser aprovada.")
        occurred = _insert_event(conn, card_id, "ref_added", author, text=url or titulo)
        cursor = conn.execute("INSERT INTO card_refs (card_id, tipo, titulo, url, arquivo, tamanho, criado_em)"
                              " VALUES (?,?,?,?,?,?,?)", (card_id, tipo, titulo, url, arquivo, tamanho, occurred))
        return cursor.lastrowid


# --- artefatos (o que a execução devolve para abrir direto no card) ---------------------------------

def _safe_name(nome):
    return re.sub(r"[^A-Za-z0-9._-]+", "-", os.path.basename(nome or "arquivo")).strip("-.")[:120] or "arquivo"


def add_artifact(card_id, author, nome, data):
    """Guarda um artefato da execução. Um artefato com o mesmo nome substitui o anterior (nova rodada)."""
    if not data:
        raise ValueError("Artefato vazio.")
    if len(data) > MAX_FILE:
        raise ValueError("Artefato passa de 20 MB.")
    safe = _safe_name(nome)
    folder = _files_dir() / str(card_id)
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    stored = f"art-{uuid.uuid4().hex[:12]}-{safe}"
    (folder / stored).write_bytes(data)
    try:
        with closing(_connection()) as conn, _transaction(conn):
            _card(conn, card_id)
            old = conn.execute("SELECT id, arquivo FROM card_artifacts WHERE card_id=? AND nome=?",
                               (card_id, safe)).fetchall()
            conn.execute("DELETE FROM card_artifacts WHERE card_id=? AND nome=?", (card_id, safe))
            occurred = _insert_event(conn, card_id, "artifact_added", author, text=safe)
            cursor = conn.execute("INSERT INTO card_artifacts (card_id, nome, arquivo, tamanho, criado_em)"
                                  " VALUES (?,?,?,?,?)", (card_id, safe, f"{card_id}/{stored}", len(data), occurred))
    except Exception:
        (folder / stored).unlink(missing_ok=True)
        raise
    for row in old:
        (_files_dir() / row["arquivo"]).unlink(missing_ok=True)
    return cursor.lastrowid


# --- custo (chamadas do Claude) -------------------------------------------------------------------

def record_run(card_id, kind, model, cost_usd=0.0, turns=0, duration_ms=0, job_id=None, when=None):
    with closing(_connection()) as conn, _transaction(conn):
        _card(conn, card_id)
        conn.execute("INSERT INTO card_runs (card_id, job_id, kind, model, cost_usd, turns, duration_ms, criado_em)"
                     " VALUES (?,?,?,?,?,?,?,?)",
                     (card_id, job_id, kind, model, max(0.0, float(cost_usd or 0)), int(turns or 0),
                      int(duration_ms or 0), _iso(when)))


def has_runs(card_id):
    with closing(_connection()) as conn:
        return conn.execute("SELECT 1 FROM card_runs WHERE card_id=? LIMIT 1", (card_id,)).fetchone() is not None


def job_cost(job_id):
    """Gasto (US$ equivalente) de um pedido: o executor usa para respeitar o teto por execução."""
    with closing(_connection()) as conn:
        return conn.execute("SELECT COALESCE(SUM(cost_usd), 0) FROM card_runs WHERE job_id=?", (job_id,)).fetchone()[0]


def card_cost(card_id):
    """{total, chamadas, por_modelo: [{model, chamadas, cost_usd}]} do card, do mais caro para o mais barato."""
    with closing(_connection()) as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT model, COUNT(*) AS chamadas, SUM(cost_usd) AS cost_usd FROM card_runs WHERE card_id=?"
            " GROUP BY model ORDER BY cost_usd DESC", (card_id,)).fetchall()]
    return {"total": sum(r["cost_usd"] for r in rows), "chamadas": sum(r["chamadas"] for r in rows), "por_modelo": rows}


def artifact(card_id, artifact_id):
    with closing(_connection()) as conn:
        row = conn.execute("SELECT * FROM card_artifacts WHERE id=? AND card_id=?", (artifact_id, card_id)).fetchone()
    if row is None:
        raise NotFound(f"Artefato {artifact_id} não existe.")
    return dict(row, path=str(_files_dir() / row["arquivo"]))


def ref(card_id, ref_id):
    with closing(_connection()) as conn:
        row = conn.execute("SELECT * FROM card_refs WHERE id=? AND card_id=?", (ref_id, card_id)).fetchone()
    if row is None:
        raise NotFound(f"Referência {ref_id} não existe.")
    item = dict(row)
    if item["arquivo"]:
        item["path"] = str(_files_dir() / item["arquivo"])
    return item


def change_stage(card_id, to_stage, author, text=None, occurred_at=None):
    """Valida com `can_transition`, grava o evento e atualiza `etapa_atual` atomicamente.

    Quando o Sato leva o card para `proposta`, abre um pedido ao Hermes (devolve o id do pedido);
    enquanto ele está aberto, o Sato não move o card. Sair de `proposta` encerra o pedido.
    """
    text = text.strip() if isinstance(text, str) else text
    with closing(_connection()) as conn, _transaction(conn):
        row = _card(conn, card_id)
        from_stage = row["etapa_atual"]
        if not can_transition(from_stage, to_stage):
            raise InvalidTransition(f"Transição inválida: {from_stage} → {to_stage}.")
        if author == "sato" and _open_job(conn, card_id):
            raise InvalidTransition(LOCKED)
        if to_stage == "execucao" and author == "sato" and not row["repo_id"] and not row["novo_repo"]:
            raise InvalidTransition("Ligue o card a um repositório antes de executar.")
        if (from_stage, to_stage) in NEEDS_TEXT and not text:
            raise InvalidTransition(f"Voltar de {from_stage} para {to_stage} exige comentário.")
        # Proposta vazia não vai para revisão (o sync com o GitHub pula etapas e fica de fora).
        empty = not (row["proposta"] or "").strip()
        if (from_stage, to_stage) == ("proposta", "revisao") and author != "github-sync" and empty:
            raise InvalidTransition("A proposta ainda está vazia.")
        if (from_stage, to_stage) == ("proposta", "revisao") and author not in (*team.PROPOSAL_AUTHORS, "github-sync"):
            raise InvalidTransition("Quem manda a proposta para revisão é o agente Requisitos (ou o Sato).")
        if (from_stage, to_stage) == ("revisao", "aprovado") and author not in ("sato", "github-sync"):
            raise InvalidTransition("Só o Sato aprova a proposta.")
        # A proposta aprovada é a spec: sem critério de aceite não há como conferir a entrega (ADR 0013).
        if (from_stage, to_stage) == ("revisao", "aprovado") and author != "github-sync" \
                and not spec.criteria(row["proposta"]):
            raise InvalidTransition("A proposta não tem critérios de aceite (C1, C2…). Peça ajuste ao Hermes.")
        occurred = _insert_event(conn, card_id, "stage_change", author, from_stage=from_stage,
                                 to_stage=to_stage, text=text or None, occurred_at=occurred_at)
        conn.execute("UPDATE cards SET etapa_atual=?, atualizado_em=? WHERE id=?", (to_stage, occurred, card_id))
        if from_stage in JOB_STAGES:
            conn.execute("UPDATE agent_jobs SET status='done', finished_at=? WHERE card_id=?"
                         " AND status IN ('queued','running')", (occurred, card_id))
        # O Sato (ou o Sato Agent, a pedido dele) chama o agente da etapa; a entrega chama o Revisor.
        if to_stage in JOB_STAGES and (author == "sato" or (author, to_stage) == ("hermes", "proposta")
                                       or (author in EXECUTORS and to_stage == "revisao_codigo")):
            return _queue_job(conn, card_id, occurred, to_stage)
        return None


# --- pedidos ao Hermes ------------------------------------------------------------------------------

# Etapa → tipo de pedido: entrar nela (pelo Sato) pede ao agente; sair dela fecha o pedido.
# `proposta`: o Hermes escreve a proposta. `execucao`: o Claude planeja e executa (kanbagent_exec.py).
# `revisao_codigo`: o Hermes revisa o PR (kanbagent_review.py); também quando o Claude entrega.
JOB_STAGES = ("proposta", "execucao", "revisao_codigo")
# Pedido rodando sem sinal de vida (progresso) há mais que isso morreu (deploy, queda).
JOB_STALE = timedelta(minutes=20)
STALE_ERROR = "O agente parou no meio (sem sinal há 20 min)."
LOCKED = "Um agente está trabalhando neste card; espere terminar."


def _queue_job(conn, card_id, when=None, kind="proposta"):
    cursor = conn.execute("INSERT INTO agent_jobs (card_id, kind, status, requested_at) VALUES (?,?,?,?)",
                          (card_id, kind, "queued", _iso(when)))
    return cursor.lastrowid


def _alive_at(row):
    return row["heartbeat_at"] or row["started_at"]


def _stale(row, now=None):
    return row["status"] == "running" and bool(_alive_at(row)) \
        and _parse(_alive_at(row)) < _parse(_iso(now)) - JOB_STALE


def _expire_stale(conn, now=None):
    limit = (_parse(_iso(now)) - JOB_STALE).isoformat(timespec="seconds")
    conn.execute("UPDATE agent_jobs SET status='failed', finished_at=?, error=?"
                 " WHERE status='running' AND COALESCE(heartbeat_at, started_at) < ?", (_iso(now), STALE_ERROR, limit))


def _open_job(conn, card_id):
    row = conn.execute("SELECT * FROM agent_jobs WHERE card_id=? AND status IN ('queued','running')"
                       " ORDER BY id DESC LIMIT 1", (card_id,)).fetchone()
    return None if row is None or _stale(row) else row


def request_agent(card_id):
    """Pede de novo ao agente o trabalho da etapa atual (proposta ou execução) depois de uma falha."""
    with closing(_connection()) as conn, _transaction(conn):
        row = _card(conn, card_id)
        if row["etapa_atual"] not in JOB_STAGES:
            raise InvalidTransition("Só cards em Proposta, Execução ou Revisão de código pedem trabalho a um agente.")
        _expire_stale(conn)
        if _open_job(conn, card_id):
            raise InvalidTransition("Um agente já está trabalhando neste card.")
        return _queue_job(conn, card_id, kind=row["etapa_atual"])


request_proposal = request_agent


def claim_job(kind="proposta", now=None):
    """O worker de `kind` pega o pedido mais antigo da fila (e marca como morto o que travou)."""
    with closing(_connection()) as conn, _transaction(conn):
        _expire_stale(conn, now)
        row = conn.execute("SELECT * FROM agent_jobs WHERE status='queued' AND kind=? ORDER BY id LIMIT 1",
                           (kind,)).fetchone()
        if row is None:
            return None
        started = _iso(now)
        conn.execute("UPDATE agent_jobs SET status='running', started_at=?, heartbeat_at=?, progress='começando'"
                     " WHERE id=?", (started, started, row["id"]))
        return dict(row, status="running", started_at=started, heartbeat_at=started)


def job_progress(job_id, text):
    """Passo atual do agente; também é o sinal de vida do pedido."""
    with closing(_connection()) as conn, _transaction(conn):
        conn.execute("UPDATE agent_jobs SET progress=?, heartbeat_at=? WHERE id=? AND status='running'",
                     (str(text)[:200], _now(), job_id))


def finish_job(job_id, error=None, now=None, result=None):
    """Fecha o pedido: sem erro = feito (com `result`, ex.: a revisão); com erro o card destrava e mostra o motivo."""
    with closing(_connection()) as conn, _transaction(conn):
        conn.execute("UPDATE agent_jobs SET status=?, finished_at=?, error=?, result=? WHERE id=?"
                     " AND status IN ('queued','running')",
                     ("failed" if error else "done", _iso(now), str(error)[:500] if error else None,
                      None if error else result, job_id))


def review(item):
    """Revisão concluída do card em `revisao_codigo` (pedido feito com resultado), ou None."""
    job = item.get("job")
    if item["etapa_atual"] != "revisao_codigo" or not job or job["kind"] != "revisao_codigo" \
            or job["status"] != "done" or not job.get("result"):
        return None
    text = job["result"]
    return {"aprovar": text.lstrip().upper().startswith("VEREDITO: APROVAR"), "texto": text}


def job(job_id):
    with closing(_connection()) as conn:
        row = conn.execute("SELECT * FROM agent_jobs WHERE id=?", (job_id,)).fetchone()
    return dict(row) if row else None


def latest_jobs(card_ids=None):
    """Último pedido de cada card (o quadro mostra 'propondo…' e acompanha ao vivo)."""
    sql = ("SELECT j.* FROM agent_jobs j JOIN (SELECT card_id, MAX(id) AS id FROM agent_jobs GROUP BY card_id) last"
           " ON last.id=j.id")
    with closing(_connection()) as conn:
        rows = [dict(r) for r in conn.execute(sql).fetchall()]
    for row in rows:
        if _stale(row):
            row.update(status="failed", error=STALE_ERROR)
    if card_ids is not None:
        rows = [r for r in rows if r["card_id"] in set(card_ids)]
    return {r["card_id"]: r for r in rows}


def team_stats():
    """{agente: {eventos, cards, custo}}: o que cada um do time já fez no quadro. Custo de execução é do
    Programador, do plano é do Planejador e da segunda revisão (Claude) é do Revisor."""
    owner = {"plan": "planejador", "revisao": "revisor"}
    stats = {slug: {"eventos": 0, "cards": 0, "custo": 0.0} for slug in team.ORDER}
    with closing(_connection()) as conn:
        for row in conn.execute("SELECT author, COUNT(*), COUNT(DISTINCT card_id) FROM events GROUP BY author"):
            if row[0] in stats:
                stats[row[0]].update(eventos=row[1], cards=row[2])
        for kind, cost in conn.execute("SELECT kind, COALESCE(SUM(cost_usd), 0) FROM card_runs GROUP BY kind"):
            stats[owner.get(kind, "programador")]["custo"] += cost
    return stats


def open_jobs():
    """Pedidos na fila ou rodando, com o título do card (a página do time mostra quem está ocupado)."""
    with closing(_connection()) as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT j.*, c.titulo FROM agent_jobs j JOIN cards c ON c.id=j.card_id"
            " WHERE j.status IN ('queued','running') ORDER BY j.id").fetchall()]
    return [r for r in rows if not _stale(r)]


def add_comment(card_id, author, text, occurred_at=None):
    text = text.strip() if isinstance(text, str) else ""
    if not text:
        raise ValueError("Comentário vazio.")
    with closing(_connection()) as conn, _transaction(conn):
        _card(conn, card_id)
        occurred = _insert_event(conn, card_id, "comment", author, text=text, occurred_at=occurred_at)
        conn.execute("UPDATE cards SET atualizado_em=? WHERE id=?", (occurred, card_id))


def stage_durations(card_id, now=None):
    """Segundos por etapa, somando cada passagem; a etapa atual conta até `now`."""
    end = _parse(_iso(now))
    with closing(_connection()) as conn:
        _card(conn, card_id)
        rows = conn.execute(
            "SELECT to_stage, occurred_at FROM events WHERE card_id=? AND kind='stage_change'"
            " ORDER BY occurred_at, id", (card_id,)).fetchall()
    durations = {}
    for current, following in zip(rows, list(rows[1:]) + [None]):
        until = _parse(following["occurred_at"]) if following else end
        seconds = max(0.0, (until - _parse(current["occurred_at"])).total_seconds())
        durations[current["to_stage"]] = durations.get(current["to_stage"], 0.0) + seconds
    return durations


# --- esforço x espera -----------------------------------------------------------------------------
# Tempo corrido numa etapa não é trabalho: um card esperando você abrir não gastou esforço nenhum.
# esforço = agente trabalhando (pedidos ao Hermes/Claude) + você com o card aberto, visível e ativo;
# espera  = o resto do tempo corrido da etapa.

PING_MAX = 30       # crédito máximo por aviso de presença (a página avisa a cada 15 s)
PING_GAP = 60       # silêncio maior que isso encerra a sessão de leitura
PING_FIRST = 5      # crédito do primeiro aviso de uma sessão
USER_STAGES = ("ideia", "revisao", "aprovado", "revisao_codigo")    # etapas que esperam uma ação sua
JOB_STAGE = {"proposta": "proposta", "execucao": "execucao", "revisao_codigo": "revisao_codigo"}


def add_attention(card_id, now=None):
    """Avisa que o Sato está com o card aberto agora. Credita o tempo desde o aviso anterior (no máximo
    PING_MAX), então avisar mais vezes não infla nada. Devolve os segundos creditados."""
    moment = _parse(_iso(now))
    with closing(_connection()) as conn, _transaction(conn):
        row = _card(conn, card_id)
        stage = row["etapa_atual"]
        if stage in TERMINAL:
            return 0.0
        prev = conn.execute("SELECT last_ping FROM card_attention WHERE card_id=? AND stage=?",
                            (card_id, stage)).fetchone()
        credit = float(PING_FIRST)
        if prev and prev["last_ping"]:
            gap = (moment - _parse(prev["last_ping"])).total_seconds()
            if 0 <= gap <= PING_GAP:
                credit = min(gap, float(PING_MAX))
            elif gap < 0:
                credit = 0.0
        conn.execute("INSERT INTO card_attention (card_id, stage, seconds, last_ping) VALUES (?,?,?,?)"
                     " ON CONFLICT(card_id, stage) DO UPDATE SET seconds=seconds+excluded.seconds,"
                     " last_ping=excluded.last_ping", (card_id, stage, credit, _iso(moment)))
        return credit


def effort(card_id, now=None):
    """Por etapa aberta: {total, agente, atencao, espera} em segundos, mais os totais do card."""
    durations = stage_durations(card_id, now=now)
    end = _parse(_iso(now))
    with closing(_connection()) as conn:
        attention = {r["stage"]: r["seconds"] for r in conn.execute(
            "SELECT stage, seconds FROM card_attention WHERE card_id=?", (card_id,)).fetchall()}
        agent = {}
        for job in conn.execute("SELECT kind, started_at, finished_at FROM agent_jobs WHERE card_id=?"
                                " AND started_at IS NOT NULL", (card_id,)).fetchall():
            stage = JOB_STAGE.get(job["kind"])
            if stage:
                until = _parse(job["finished_at"]) if job["finished_at"] else end
                agent[stage] = agent.get(stage, 0.0) + max(0.0, (until - _parse(job["started_at"])).total_seconds())
    stages = {}
    for stage, total in durations.items():
        if stage in TERMINAL:
            continue
        worked = min(agent.get(stage, 0.0), total)
        looked = min(attention.get(stage, 0.0), total - worked)
        stages[stage] = {"total": total, "agente": worked, "atencao": looked, "espera": total - worked - looked}
    sums = {key: sum(s[key] for s in stages.values()) for key in ("total", "agente", "atencao", "espera")}
    return {"por_etapa": stages, **sums, "esforco": sums["agente"] + sums["atencao"]}


# --- leitura, proposta, links e métricas (página, API e sync) -------------------------------------

STAGE_LABELS = {
    "ideia": "Ideia", "proposta": "Proposta", "revisao": "Em revisão", "aprovado": "Fila de execução",
    "execucao": "Em execução", "revisao_codigo": "Revisão de código", "entregue": "Entregue",
    "descartado": "Descartado",
}
GITHUB_URL = re.compile(r"^https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/(issues|pull)/(\d+)/?(?:[#?].*)?$")


_RETURNS_SQL = ",".join(f"('{a}','{b}')" for a, b in sorted(RETURNS))


def next_stages(stage):
    """Etapas para onde o card pode ir a partir de `stage`, na ordem do ciclo."""
    return [to for to in STAGES if can_transition(stage, to)]


def projects():
    """Projetos ativos com seus repositórios."""
    with closing(_connection()) as conn:
        rows = conn.execute("SELECT * FROM projects WHERE arquivado_em IS NULL ORDER BY nome").fetchall()
        repos = conn.execute(
            "SELECT pr.project_id, r.id, r.full_name FROM project_repos pr JOIN repos r ON r.id = pr.repo_id"
            " ORDER BY r.full_name").fetchall()
    by_project = {}
    for repo in repos:
        by_project.setdefault(repo["project_id"], []).append({"id": repo["id"], "full_name": repo["full_name"]})
    return [dict(row, repos=by_project.get(row["id"], [])) for row in rows]


def project_by_slug(slug):
    with closing(_connection()) as conn:
        row = conn.execute("SELECT id FROM projects WHERE slug=?", (slug,)).fetchone()
    if row is None:
        raise NotFound(f"Projeto {slug!r} não existe.")
    return row["id"]


def repo_id(full_name):
    with closing(_connection()) as conn:
        row = conn.execute("SELECT id FROM repos WHERE full_name=?", (full_name,)).fetchone()
    if row is None:
        raise NotFound(f"Repositório {full_name!r} não existe.")
    return row["id"]


def _entered_current(conn, card_id):
    row = conn.execute(
        "SELECT occurred_at FROM events WHERE card_id=? AND kind='stage_change' ORDER BY occurred_at DESC, id DESC"
        " LIMIT 1", (card_id,)).fetchone()
    return row["occurred_at"] if row else None


def cards(project_id=None, repo_id=None, stage=None):
    """Cards para o quadro, com projeto, repositório e quando entraram na etapa atual."""
    where, args = [], []
    if project_id is not None:
        where.append("c.project_id=?")
        args.append(project_id)
    if repo_id is not None:
        where.append("(c.repo_id=? OR EXISTS (SELECT 1 FROM card_links l WHERE l.card_id=c.id AND l.repo_id=?))")
        args.extend([repo_id, repo_id])
    if stage is not None:
        where.append("c.etapa_atual=?")
        args.append(stage)
    sql = ("SELECT c.*, p.nome AS projeto, p.slug AS projeto_slug, r.full_name AS repo,"
           " (SELECT MAX(occurred_at) FROM events e WHERE e.card_id=c.id AND e.kind='stage_change') AS na_etapa_desde,"
           " (SELECT COUNT(*) FROM events e WHERE e.card_id=c.id AND e.kind='stage_change'"
           "   AND (e.from_stage, e.to_stage) IN (" + _RETURNS_SQL + ")) AS ajustes,"
           " (SELECT COUNT(*) FROM card_links l WHERE l.card_id=c.id) AS links,"
           " (SELECT COALESCE(SUM(cr.cost_usd), 0) FROM card_runs cr WHERE cr.card_id=c.id) AS custo"
           " FROM cards c LEFT JOIN projects p ON p.id=c.project_id LEFT JOIN repos r ON r.id=c.repo_id")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY c.atualizado_em DESC, c.id DESC"
    with closing(_connection()) as conn:
        rows = [dict(row) for row in conn.execute(sql, args).fetchall()]
    jobs = latest_jobs()
    for row in rows:
        row["job"] = jobs.get(row["id"])
    return rows


def card(card_id, now=None):
    """Card completo: dados, eventos em ordem, links, tempo por etapa e total."""
    with closing(_connection()) as conn:
        row = dict(_card(conn, card_id))
        extra = conn.execute(
            "SELECT p.nome AS projeto, p.slug AS projeto_slug, r.full_name AS repo FROM cards c"
            " LEFT JOIN projects p ON p.id=c.project_id LEFT JOIN repos r ON r.id=c.repo_id WHERE c.id=?",
            (card_id,)).fetchone()
        events = [dict(e) for e in conn.execute(
            "SELECT * FROM events WHERE card_id=? ORDER BY occurred_at, id", (card_id,)).fetchall()]
        links = [dict(link) for link in conn.execute(
            "SELECT l.*, r.full_name AS repo FROM card_links l LEFT JOIN repos r ON r.id=l.repo_id"
            " WHERE l.card_id=? ORDER BY l.id", (card_id,)).fetchall()]
        refs = [dict(r, path=str(_files_dir() / r["arquivo"]) if r["arquivo"] else None) for r in conn.execute(
            "SELECT * FROM card_refs WHERE card_id=? ORDER BY id", (card_id,)).fetchall()]
        artifacts = [dict(a) for a in conn.execute(
            "SELECT * FROM card_artifacts WHERE card_id=? ORDER BY id", (card_id,)).fetchall()]
        row["na_etapa_desde"] = _entered_current(conn, card_id)
    row.update(dict(extra))
    durations = stage_durations(card_id, now=now)
    end = _parse(_iso(now))
    final = next((e["occurred_at"] for e in reversed(events)
                  if e["kind"] == "stage_change" and e["to_stage"] in TERMINAL), None)
    total_until = _parse(final) if final and row["etapa_atual"] in TERMINAL else end
    row.update(events=events, links=links, refs=refs, artifacts=artifacts, durations=durations, custo=card_cost(card_id),
               esforco=effort(card_id, now=now), spec=spec.summary(row.get("proposta")),
               total_seconds=max(0.0, (total_until - _parse(row["criado_em"])).total_seconds()),
               ajustes=sum(1 for e in events if e["kind"] == "stage_change"
                           and (e["from_stage"], e["to_stage"]) in RETURNS),
               proximas=next_stages(row["etapa_atual"]),
               job=latest_jobs([card_id]).get(card_id))
    return row


def update_proposal(card_id, proposta, author, occurred_at=None):
    """Reescreve a proposta (a ideia original nunca muda) e registra `proposal_updated`."""
    proposta = proposta.strip() if isinstance(proposta, str) else ""
    if not proposta:
        raise ValueError("Proposta vazia.")
    if author not in team.PROPOSAL_AUTHORS:
        raise InvalidTransition("Quem escreve a proposta é o agente Requisitos (ou o Sato).")
    with closing(_connection()) as conn, _transaction(conn):
        _card(conn, card_id)
        if author == "sato" and _open_job(conn, card_id):
            raise InvalidTransition(LOCKED)
        occurred = _insert_event(conn, card_id, "proposal_updated", author, occurred_at=occurred_at)
        conn.execute("UPDATE cards SET proposta=?, atualizado_em=? WHERE id=?", (proposta, occurred, card_id))


def parse_github_url(url):
    """`(owner/repo, 'issue'|'pr', número)` de uma URL de issue ou PR do GitHub."""
    match = GITHUB_URL.match((url or "").strip())
    if not match:
        raise ValueError("Use a URL de uma issue ou PR do GitHub (https://github.com/owner/repo/issues/N).")
    full_name, kind, number = match.groups()
    return full_name, "pr" if kind == "pull" else "issue", int(number)


def add_link(card_id, url, author, occurred_at=None):
    """Liga uma issue ou PR ao card. Repetir a mesma URL não duplica; devolve o id do link."""
    full_name, kind, number = parse_github_url(url)
    clean = f"https://github.com/{full_name}/{'pull' if kind == 'pr' else 'issues'}/{number}"
    with closing(_connection()) as conn, _transaction(conn):
        _card(conn, card_id)
        conn.execute("INSERT OR IGNORE INTO repos (full_name) VALUES (?)", (full_name,))
        rid = conn.execute("SELECT id FROM repos WHERE full_name=?", (full_name,)).fetchone()[0]
        existing = conn.execute("SELECT id FROM card_links WHERE card_id=? AND url=?", (card_id, clean)).fetchone()
        if existing:
            return existing["id"]
        occurred = _insert_event(conn, card_id, "link_added", author, text=clean, occurred_at=occurred_at)
        cursor = conn.execute(
            "INSERT INTO card_links (card_id, repo_id, numero, url, tipo, criado_em) VALUES (?,?,?,?,?,?)",
            (card_id, rid, number, clean, kind, occurred))
        conn.execute("UPDATE cards SET atualizado_em=? WHERE id=?", (occurred, card_id))
        return cursor.lastrowid


def set_link_state(link_id, estado):
    """Estado observado no GitHub (open, closed, merged...). Não é evento: é só o último visto."""
    with closing(_connection()) as conn, _transaction(conn):
        conn.execute("UPDATE card_links SET estado=?, atualizado_em=? WHERE id=?", (estado, _now(), link_id))


def links_to_sync():
    """Links de cards ainda em andamento depois da aprovação."""
    with closing(_connection()) as conn:
        return [dict(row) for row in conn.execute(
            "SELECT l.*, r.full_name AS repo, c.etapa_atual FROM card_links l JOIN cards c ON c.id=l.card_id"
            " JOIN repos r ON r.id=l.repo_id WHERE c.etapa_atual IN ('aprovado','execucao','revisao_codigo')"
            " ORDER BY l.card_id, l.id").fetchall()]


def advance_to(card_id, target, author, occurred_at=None, text=None):
    """Avança pelo caminho principal até `target`, gravando cada passagem; no-op se já passou.

    As datas vêm do GitHub e nunca ficam antes do último evento do card, para a linha do tempo não
    andar para trás. Devolve as etapas gravadas.
    """
    if target not in MAIN_PATH:
        raise ValueError(f"{target!r} não está no caminho principal.")
    moved = []
    with closing(_connection()) as conn:
        current = _card(conn, card_id)["etapa_atual"]
        last = _entered_current(conn, card_id)
        busy = _open_job(conn, card_id) is not None
    if busy:   # o agente está no meio (ex.: reexecutando depois de reprovado); ele mesmo move o card
        return moved
    if current not in MAIN_PATH or MAIN_PATH.index(current) >= MAIN_PATH.index(target):
        return moved
    when = _parse(_iso(occurred_at))
    if last and when < _parse(last):
        when = _parse(last)
    for stage in MAIN_PATH[MAIN_PATH.index(current) + 1: MAIN_PATH.index(target) + 1]:
        change_stage(card_id, stage, author, text=text, occurred_at=when)
        moved.append(stage)
    return moved


def metrics(project_id=None, repo_id=None, since=None, now=None):
    """Tempos por etapa e gargalos a partir dos eventos.

    - `por_etapa`: média e soma de segundos das passagens **concluídas** em cada etapa;
    - `parados`: cards abertos ordenados por tempo na etapa atual;
    - `entregues`: cards entregues desde `since`, com tempo total ideia → entrega.
    """
    end = _parse(_iso(now))
    start = _parse(_iso(since)) if since else None
    selected = cards(project_id=project_id, repo_id=repo_id)
    ids = [c["id"] for c in selected]
    passages = {stage: [] for stage in STAGES}
    delivered, open_cards, adjustments = [], [], 0
    if ids:
        with closing(_connection()) as conn:
            marks = ",".join("?" * len(ids))
            rows = conn.execute(
                f"SELECT card_id, from_stage, to_stage, occurred_at FROM events WHERE kind='stage_change'"
                f" AND card_id IN ({marks}) ORDER BY card_id, occurred_at, id", ids).fetchall()
        by_card = {}
        for row in rows:
            by_card.setdefault(row["card_id"], []).append(row)
        for item in selected:
            changes = by_card.get(item["id"], [])
            for current, following in zip(changes, changes[1:]):
                seconds = (_parse(following["occurred_at"]) - _parse(current["occurred_at"])).total_seconds()
                if start is None or _parse(following["occurred_at"]) >= start:
                    passages[current["to_stage"]].append(max(0.0, seconds))
                    if (following["from_stage"], following["to_stage"]) in RETURNS:
                        adjustments += 1
            if item["etapa_atual"] == "entregue" and changes:
                delivered_at = _parse(changes[-1]["occurred_at"])
                if start is None or delivered_at >= start:
                    delivered.append(dict(item, entregue_em=changes[-1]["occurred_at"],
                                          total_seconds=(delivered_at - _parse(item["criado_em"])).total_seconds()))
            elif item["etapa_atual"] not in TERMINAL and item["na_etapa_desde"]:
                open_cards.append(dict(item, parado_seconds=(end - _parse(item["na_etapa_desde"])).total_seconds()))
    por_etapa = {stage: {"passagens": len(values), "media_seconds": (sum(values) / len(values)) if values else None,
                         "total_seconds": sum(values), "esforco_seconds": 0.0}
                 for stage, values in passages.items() if stage not in TERMINAL}
    for item in selected:      # esforço do card, repartido pelas passagens do período
        worked = effort(item["id"], now=now)["por_etapa"]
        for stage, parts in worked.items():
            row = por_etapa.get(stage)
            if row and row["total_seconds"] and parts["total"]:
                row["esforco_seconds"] += (parts["agente"] + parts["atencao"]) * min(1.0, row["total_seconds"] / parts["total"])
    for row in por_etapa.values():
        n = row["passagens"]
        row["esforco_seconds"] = min(row["esforco_seconds"], row["total_seconds"])
        row["esforco_media_seconds"] = (row["esforco_seconds"] / n) if n else None
        row["espera_media_seconds"] = ((row["total_seconds"] - row["esforco_seconds"]) / n) if n else None
    totals = [d["total_seconds"] for d in delivered]
    return {
        "cards": len(selected),
        "por_etapa": por_etapa,
        "gargalo": max((s for s in por_etapa if por_etapa[s]["media_seconds"] is not None),
                       key=lambda s: por_etapa[s]["espera_media_seconds"], default=None),
        "parados": sorted(open_cards, key=lambda c: c["parado_seconds"], reverse=True),
        "entregues": sorted(delivered, key=lambda c: c["entregue_em"], reverse=True),
        "lead_time_medio_seconds": (sum(totals) / len(totals)) if totals else None,
        "ajustes": adjustments,
        "por_etapa_agora": {stage: sum(1 for c in selected if c["etapa_atual"] == stage) for stage in STAGES},
    }
