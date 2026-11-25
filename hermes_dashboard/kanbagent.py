"""kanbagent: domínio do kanban pessoal do Sato, com banco próprio (ADR 0009).

Sem Flask: rotas, API e página chamam estas funções. `events` é a fonte da
verdade do tempo e só recebe INSERT; `cards.etapa_atual` é cache do último
`stage_change`, gravado na mesma transação. Desenho em docs/kanbagent.md.
"""
import os
import re
import sqlite3
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config

DB_PATH = Path(os.getenv("KANBAGENT_DB_PATH", str(config.HERMES_HOME / "kanbagent.sqlite3")))

STAGES = ("ideia", "proposta", "revisao", "aprovado", "execucao", "revisao_codigo", "entregue", "descartado")
TERMINAL = {"entregue", "descartado"}
MAIN_PATH = ("ideia", "proposta", "revisao", "aprovado", "execucao", "revisao_codigo", "entregue")
EVENT_KINDS = ("stage_change", "comment", "link_added", "proposal_updated")
AUTHORS = ("sato", "hermes", "github-sync", "claude")

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
# só existe o ciclo execução ⇄ revisão de código até entregar (ou descartar).
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


def add_repo_to_project(project_id, full_name):
    """Liga `owner/repo` ao projeto (cria o repo se preciso); devolve o id do repo. Repetir não duplica."""
    owner, _, name = (full_name or "").partition("/")
    if not owner or not name or "/" in name:
        raise ValueError("Repositório precisa estar no formato owner/repo.")
    with closing(_connection()) as conn, _transaction(conn):
        if conn.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone() is None:
            raise NotFound(f"Projeto {project_id} não existe.")
        conn.execute("INSERT OR IGNORE INTO repos (full_name) VALUES (?)", (full_name,))
        repo_id = conn.execute("SELECT id FROM repos WHERE full_name=?", (full_name,)).fetchone()[0]
        conn.execute("INSERT OR IGNORE INTO project_repos (project_id, repo_id) VALUES (?,?)", (project_id, repo_id))
        return repo_id


def create_card(titulo, ideia_original, author, project_id=None, repo_id=None, occurred_at=None):
    """Grava o card em `ideia` com o evento inicial `None → ideia`, na mesma transação."""
    if not titulo or not ideia_original:
        raise ValueError("Card precisa de título e ideia original.")
    with closing(_connection()) as conn, _transaction(conn):
        if project_id is not None and conn.execute(
                "SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone() is None:
            raise NotFound(f"Projeto {project_id} não existe.")
        if repo_id is not None and (project_id is None or conn.execute(
                "SELECT 1 FROM project_repos WHERE project_id=? AND repo_id=?",
                (project_id, repo_id)).fetchone() is None):
            raise ValueError("O repositório do card precisa ser um dos repositórios do projeto.")
        occurred = _iso(occurred_at)
        cursor = conn.execute(
            "INSERT INTO cards (project_id, repo_id, titulo, ideia_original, etapa_atual, criado_em, atualizado_em)"
            " VALUES (?,?,?,?,?,?,?)",
            (project_id, repo_id, titulo, ideia_original, "ideia", occurred, occurred))
        _insert_event(conn, cursor.lastrowid, "stage_change", author, to_stage="ideia", occurred_at=occurred)
        return cursor.lastrowid


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
        if to_stage == "execucao" and author == "sato" and not row["repo_id"]:
            raise InvalidTransition("Ligue o card a um repositório antes de executar.")
        if (from_stage, to_stage) in NEEDS_TEXT and not text:
            raise InvalidTransition(f"Voltar de {from_stage} para {to_stage} exige comentário.")
        # Proposta vazia não vai para revisão (o sync com o GitHub pula etapas e fica de fora).
        empty = not (row["proposta"] or "").strip()
        if (from_stage, to_stage) == ("proposta", "revisao") and author != "github-sync" and empty:
            raise InvalidTransition("A proposta ainda está vazia.")
        occurred = _insert_event(conn, card_id, "stage_change", author, from_stage=from_stage,
                                 to_stage=to_stage, text=text or None, occurred_at=occurred_at)
        conn.execute("UPDATE cards SET etapa_atual=?, atualizado_em=? WHERE id=?", (to_stage, occurred, card_id))
        if from_stage in JOB_STAGES:
            conn.execute("UPDATE agent_jobs SET status='done', finished_at=? WHERE card_id=?"
                         " AND status IN ('queued','running')", (occurred, card_id))
        if to_stage in JOB_STAGES and (author == "sato" or (author, to_stage) == ("claude", "revisao_codigo")):
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
           " (SELECT COUNT(*) FROM card_links l WHERE l.card_id=c.id) AS links"
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
        row["na_etapa_desde"] = _entered_current(conn, card_id)
    row.update(dict(extra))
    durations = stage_durations(card_id, now=now)
    end = _parse(_iso(now))
    final = next((e["occurred_at"] for e in reversed(events)
                  if e["kind"] == "stage_change" and e["to_stage"] in TERMINAL), None)
    total_until = _parse(final) if final and row["etapa_atual"] in TERMINAL else end
    row.update(events=events, links=links, durations=durations,
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
                         "total_seconds": sum(values)} for stage, values in passages.items() if stage not in TERMINAL}
    totals = [d["total_seconds"] for d in delivered]
    return {
        "cards": len(selected),
        "por_etapa": por_etapa,
        "gargalo": max((s for s in por_etapa if por_etapa[s]["media_seconds"] is not None),
                       key=lambda s: por_etapa[s]["media_seconds"], default=None),
        "parados": sorted(open_cards, key=lambda c: c["parado_seconds"], reverse=True),
        "entregues": sorted(delivered, key=lambda c: c["entregue_em"], reverse=True),
        "lead_time_medio_seconds": (sum(totals) / len(totals)) if totals else None,
        "ajustes": adjustments,
        "por_etapa_agora": {stage: sum(1 for c in selected if c["etapa_atual"] == stage) for stage in STAGES},
    }
