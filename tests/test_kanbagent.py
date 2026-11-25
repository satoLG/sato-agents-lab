"""Domínio do kanbagent: banco próprio, ciclo do card e tempo por etapa (ADR 0009)."""
import re
import sqlite3
from pathlib import Path

import pytest

from hermes_dashboard import kanbagent

VALID = {
    ("ideia", "proposta"), ("proposta", "revisao"), ("revisao", "aprovado"),
    ("aprovado", "execucao"), ("execucao", "revisao_codigo"), ("revisao_codigo", "entregue"),
    ("revisao", "proposta"), ("proposta", "ideia"), ("revisao", "ideia"), ("revisao_codigo", "execucao"),
    *{(stage, "descartado") for stage in kanbagent.STAGES if stage not in {"entregue", "descartado"}},
}


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = tmp_path / "kanbagent.sqlite3"
    monkeypatch.setattr(kanbagent, "DB_PATH", path)
    return path


def rows(path, sql, params=()):
    with sqlite3.connect(path) as conn:
        return conn.execute(sql, params).fetchall()


def card_at(stage, **kwargs):
    card = kanbagent.create_card("Título", "ideia crua", "sato", **kwargs)
    path = {"ideia": [], "proposta": ["proposta"], "revisao": ["proposta", "revisao"],
            "aprovado": ["proposta", "revisao", "aprovado"],
            "execucao": ["proposta", "revisao", "aprovado", "execucao"],
            "revisao_codigo": ["proposta", "revisao", "aprovado", "execucao", "revisao_codigo"],
            "entregue": ["proposta", "revisao", "aprovado", "execucao", "revisao_codigo", "entregue"],
            "descartado": ["descartado"]}[stage]
    for step in path:
        if step == "revisao":
            kanbagent.update_proposal(card, "proposta pronta", "hermes")
        kanbagent.change_stage(card, step, "hermes")
    return card


def test_empty_database_creates_tables_and_reopening_is_idempotent(db):
    kanbagent._connection().close()
    tables = {name for (name,) in rows(db, "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"projects", "repos", "project_repos", "cards", "card_links", "events"} <= tables
    schema = rows(db, "SELECT type, name FROM sqlite_master ORDER BY name")
    project = kanbagent.create_project("lab", "Lab")
    kanbagent._connection().close()
    kanbagent._connection().close()
    assert rows(db, "SELECT type, name FROM sqlite_master ORDER BY name") == schema
    assert rows(db, "SELECT id FROM projects") == [(project,)]


def test_all_documented_transitions_are_valid():
    for from_stage in kanbagent.STAGES:
        for to_stage in kanbagent.STAGES:
            assert kanbagent.can_transition(from_stage, to_stage) == ((from_stage, to_stage) in VALID), \
                (from_stage, to_stage)


@pytest.mark.parametrize("from_stage,to_stage", [
    ("ideia", "entregue"), ("entregue", "descartado"), ("aprovado", "ideia"), ("descartado", "proposta"),
    ("ideia", "revisao"), ("execucao", "proposta"), ("execucao", "aprovado"), ("descartado", "descartado"),
    ("revisao_codigo", "ideia"), ("aprovado", "proposta"), ("execucao", "ideia"), ("ideia", "ideia"), (None, "ideia"), ("ideia", "desconhecida"),
])
def test_invalid_transitions(from_stage, to_stage):
    assert not kanbagent.can_transition(from_stage, to_stage)


def test_create_card_starts_in_ideia_with_initial_event(db):
    card = kanbagent.create_card("Kanban", "ver datas e tempo gasto", "sato")
    assert rows(db, "SELECT etapa_atual, ideia_original FROM cards") == [("ideia", "ver datas e tempo gasto")]
    assert rows(db, "SELECT card_id, kind, from_stage, to_stage, author FROM events") == [
        (card, "stage_change", None, "ideia", "sato")]


def test_valid_change_stage_writes_one_event_and_updates_cache(db):
    card = kanbagent.create_card("Kanban", "ideia", "sato")
    kanbagent.change_stage(card, "proposta", "hermes")
    assert rows(db, "SELECT etapa_atual FROM cards") == [("proposta",)]
    assert rows(db, "SELECT from_stage, to_stage, author FROM events WHERE id > 1") == [("ideia", "proposta", "hermes")]
    assert rows(db, "SELECT ideia_original FROM cards") == [("ideia",)]


def test_invalid_change_stage_raises_and_writes_nothing(db):
    card = kanbagent.create_card("Kanban", "ideia", "sato")
    before = rows(db, "SELECT * FROM events"), rows(db, "SELECT * FROM cards")
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.change_stage(card, "entregue", "github-sync")
    assert (rows(db, "SELECT * FROM events"), rows(db, "SELECT * FROM cards")) == before


def test_request_adjustment_requires_text(db):
    card = card_at("revisao")
    before = rows(db, "SELECT COUNT(*) FROM events")
    for text in (None, "", "   "):
        with pytest.raises(kanbagent.InvalidTransition):
            kanbagent.change_stage(card, "proposta", "sato", text=text)
    assert rows(db, "SELECT COUNT(*) FROM events") == before
    kanbagent.change_stage(card, "proposta", "sato", text="detalhar o modelo de dados")
    assert rows(db, "SELECT text FROM events ORDER BY id DESC LIMIT 1") == [("detalhar o modelo de dados",)]


def test_change_stage_failure_rolls_back_event(db):
    card = kanbagent.create_card("Kanban", "ideia", "sato")
    with pytest.raises(ValueError):
        kanbagent.change_stage(card, "proposta", "intruso")
    assert rows(db, "SELECT COUNT(*) FROM events") == [(1,)]
    assert rows(db, "SELECT etapa_atual FROM cards") == [("ideia",)]


def test_unknown_card_is_not_found(db):
    with pytest.raises(kanbagent.NotFound):
        kanbagent.change_stage(42, "proposta", "sato")


def test_card_repo_must_belong_to_its_project(db):
    project = kanbagent.create_project("site", "Site")
    other = kanbagent.create_project("outro", "Outro")
    lab = kanbagent.add_repo_to_project(project, "satoLG/sato-agents-lab")
    hermes = kanbagent.add_repo_to_project(project, "satoLG/hermes")
    assert kanbagent.add_repo_to_project(project, "satoLG/hermes") == hermes
    outside = kanbagent.add_repo_to_project(other, "satoLG/fora")
    assert kanbagent.create_card("A", "a", "sato", project_id=project, repo_id=lab)
    assert kanbagent.create_card("B", "b", "sato", project_id=project, repo_id=hermes)
    with pytest.raises(ValueError):
        kanbagent.create_card("C", "c", "sato", project_id=project, repo_id=outside)
    with pytest.raises(ValueError):
        kanbagent.create_card("D", "d", "sato", repo_id=lab)
    assert rows(db, "SELECT titulo FROM cards ORDER BY id") == [("A",), ("B",)]
    assert rows(db, "SELECT COUNT(*) FROM events") == [(2,)]
    assert rows(db, "SELECT COUNT(*) FROM project_repos") == [(3,)]


def test_stage_durations_sum_an_adjustment_loop(db):
    card = kanbagent.create_card("Kanban", "ideia", "sato", occurred_at="2026-11-01T10:00:00+00:00")
    kanbagent.change_stage(card, "proposta", "hermes", occurred_at="2026-11-01T11:00:00+00:00")
    kanbagent.update_proposal(card, "proposta", "hermes", occurred_at="2026-11-01T12:00:00+00:00")
    kanbagent.change_stage(card, "revisao", "hermes", occurred_at="2026-11-01T13:00:00+00:00")
    kanbagent.change_stage(card, "proposta", "sato", text="ajuste", occurred_at="2026-11-02T13:00:00+00:00")
    kanbagent.change_stage(card, "revisao", "hermes", occurred_at="2026-11-02T13:30:00+00:00")
    durations = kanbagent.stage_durations(card, now="2026-11-02T15:30:00+00:00")
    assert durations == {"ideia": 3600.0, "proposta": 2 * 3600 + 1800.0, "revisao": 24 * 3600 + 2 * 3600.0}


def test_add_comment_records_event_without_changing_stage(db):
    card = kanbagent.create_card("Kanban", "ideia", "sato")
    kanbagent.add_comment(card, "sato", "lembrar das métricas")
    with pytest.raises(ValueError):
        kanbagent.add_comment(card, "sato", "  ")
    assert rows(db, "SELECT kind, text FROM events ORDER BY id") == [
        ("stage_change", None), ("comment", "lembrar das métricas")]
    assert rows(db, "SELECT etapa_atual FROM cards") == [("ideia",)]


def test_events_are_append_only(db):
    source = Path(kanbagent.__file__).read_text(encoding="utf-8")
    assert not re.search(r"\bUPDATE\s+(OR\s+\w+\s+)?events\b", source, re.I)
    assert not re.search(r"\bDELETE\s+FROM\s+events\b", source, re.I)
    assert not re.search(r"\bREPLACE\s+INTO\s+events\b", source, re.I)
    card_at("proposta")
    with sqlite3.connect(db) as conn:
        with pytest.raises(sqlite3.DatabaseError, match="só recebe INSERT"):
            conn.execute("UPDATE events SET author='sato'")
        with pytest.raises(sqlite3.DatabaseError, match="só recebe INSERT"):
            conn.execute("DELETE FROM events")


def test_returns_need_comment_and_count_as_adjustments(db):
    card = card_at("revisao")
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.change_stage(card, "ideia", "sato")
    kanbagent.change_stage(card, "ideia", "sato", text="faltou o mobile")
    kanbagent.change_stage(card, "proposta", "sato")
    kanbagent.change_stage(card, "ideia", "sato")  # proposta → ideia não pede texto
    assert kanbagent.card(card)["ajustes"] == 2
    assert kanbagent.STAGE_LABELS["aprovado"] == "Fila de execução"


def test_empty_proposal_cannot_go_to_review_except_from_sync(db):
    card = kanbagent.create_card("t", "i", "sato")
    kanbagent.change_stage(card, "proposta", "sato")
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.change_stage(card, "revisao", "sato")
    kanbagent.change_stage(card, "revisao", "github-sync")


def test_after_execution_starts_only_code_review_cycle(db):
    card = card_at("revisao_codigo")
    assert kanbagent.next_stages("revisao_codigo") == ["execucao", "entregue", "descartado"]
    assert kanbagent.next_stages("execucao") == ["revisao_codigo", "descartado"]
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.change_stage(card, "execucao", "sato")
    kanbagent.change_stage(card, "execucao", "sato", text="faltou teste")
