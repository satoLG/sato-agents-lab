"""kanbagent: domínio do kanban pessoal do Sato, com banco próprio (ADR 0009).

Sem Flask: rotas, API e página chamam estas funções. `events` é a fonte da
verdade do tempo e só recebe INSERT; `cards.etapa_atual` é cache do último
`stage_change`, gravado na mesma transação. Desenho em docs/kanbagent.md.
"""
import os
import sqlite3
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path

from . import config

DB_PATH = Path(os.getenv("KANBAGENT_DB_PATH", str(config.HERMES_HOME / "kanbagent.sqlite3")))

STAGES = ("ideia", "proposta", "revisao", "aprovado", "execucao", "revisao_codigo", "entregue", "descartado")
TERMINAL = {"entregue", "descartado"}
MAIN_PATH = ("ideia", "proposta", "revisao", "aprovado", "execucao", "revisao_codigo", "entregue")
EVENT_KINDS = ("stage_change", "comment", "link_added", "proposal_updated")
AUTHORS = ("sato", "hermes", "github-sync")

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


def can_transition(from_stage, to_stage):
    """Única regra de transições, usada pela página, pela API e pelo sync."""
    if from_stage not in STAGES or to_stage not in STAGES:
        return False
    if to_stage == "descartado":
        return from_stage not in TERMINAL
    if (from_stage, to_stage) == ("revisao", "proposta"):
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
    # Migrações futuras: só ALTER TABLE ... ADD COLUMN, checando PRAGMA table_info antes.
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
    """Valida com `can_transition`, grava o evento e atualiza `etapa_atual` atomicamente."""
    text = text.strip() if isinstance(text, str) else text
    with closing(_connection()) as conn, _transaction(conn):
        from_stage = _card(conn, card_id)["etapa_atual"]
        if not can_transition(from_stage, to_stage):
            raise InvalidTransition(f"Transição inválida: {from_stage} → {to_stage}.")
        if (from_stage, to_stage) == ("revisao", "proposta") and not text:
            raise InvalidTransition("Pedir ajuste (revisao → proposta) exige comentário.")
        occurred = _insert_event(conn, card_id, "stage_change", author, from_stage=from_stage,
                                 to_stage=to_stage, text=text or None, occurred_at=occurred_at)
        conn.execute("UPDATE cards SET etapa_atual=?, atualizado_em=? WHERE id=?", (to_stage, occurred, card_id))


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
