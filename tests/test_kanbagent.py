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
            kanbagent.update_proposal(card, "proposta pronta\n**Critérios de aceite**\n- C1: funciona — verificar: teste", "requisitos")
        kanbagent.change_stage(card, step, {"revisao": "requisitos", "aprovado": "sato"}.get(step, "hermes"))
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


def test_card_takes_any_github_repo_and_project_learns_it(db):
    project = kanbagent.create_project("site", "Site")
    lab = kanbagent.add_repo_to_project(project, "satoLG/sato-agents-lab")
    assert kanbagent.add_repo_to_project(project, "satoLG/sato-agents-lab") == lab
    card = kanbagent.create_card("A", "a", "sato", project_id=project, repo="satoLG/fora")
    assert kanbagent.card(card)["repo"] == "satoLG/fora"
    assert [r["full_name"] for r in kanbagent.projects()[0]["repos"]] == ["satoLG/fora", "satoLG/sato-agents-lab"]
    assert kanbagent.card(kanbagent.create_card("B", "b", "sato", repo_id=lab))["repo"] == "satoLG/sato-agents-lab"
    for bad in ("sem-barra", "a/b/c", "dono/repo.git", "-x/y"):
        with pytest.raises(ValueError):
            kanbagent.create_card("C", "c", "sato", repo=bad)


def test_new_repo_card_can_execute_and_repo_freezes_after_approval(db):
    card = kanbagent.create_card("Jogo", "ideia", "sato", novo_repo="satoLG/jogo-novo", publico=True)
    item = kanbagent.card(card)
    assert item["repo"] is None and (item["novo_repo"], item["novo_repo_publico"]) == ("satoLG/jogo-novo", 1)
    with pytest.raises(ValueError):
        kanbagent.create_card("X", "x", "sato", repo="satoLG/a", novo_repo="satoLG/b")
    kanbagent.set_repo(card, "sato", repo="satoLG/existente")
    assert kanbagent.card(card)["repo"] == "satoLG/existente" and kanbagent.card(card)["novo_repo"] is None
    kanbagent.set_repo(card, "sato", novo_repo="satoLG/jogo-novo")
    kanbagent.change_stage(card, "proposta", "hermes")
    kanbagent.update_proposal(card, "p\n**Critérios de aceite**\n- C1: funciona — verificar: teste", "requisitos")
    kanbagent.change_stage(card, "revisao", "requisitos")
    kanbagent.change_stage(card, "aprovado", "sato")
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.set_repo(card, "sato", repo="satoLG/outro")
    job = kanbagent.change_stage(card, "execucao", "sato")   # repo novo basta para executar
    assert kanbagent.job(job)["kind"] == "execucao"
    kanbagent.set_repo(card, "claude", repo="satoLG/jogo-novo")   # o executor grava o que criou
    assert kanbagent.card(card)["repo"] == "satoLG/jogo-novo" and kanbagent.card(card)["novo_repo"] is None


def test_refs_follow_the_card_until_approval(db):
    card = kanbagent.create_card("A", "a", "sato")
    kanbagent.add_ref_link(card, "https://example.com/ref", "sato", "Inspiração")
    ref_id = kanbagent.add_ref_file(card, "sato", "../../sprite final.png", b"PNG")
    refs = kanbagent.card(card)["refs"]
    assert [(r["tipo"], r["titulo"]) for r in refs] == [("link", "Inspiração"), ("arquivo", "sprite-final.png")]
    path = kanbagent.ref(card, ref_id)["path"]
    assert open(path, "rb").read() == b"PNG" and "kanbagent-files" in path and ".." not in path
    for bad in ("javascript:alert(1)", "ftp://x"):
        with pytest.raises(ValueError):
            kanbagent.add_ref_link(card, bad, "sato")
    with pytest.raises(ValueError):
        kanbagent.add_ref_file(card, "sato", "grande.bin", b"x" * (kanbagent.MAX_FILE + 1))
    kanbagent.change_stage(card, "descartado", "sato")
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.add_ref_link(card, "https://example.com/tarde", "sato")


def test_stage_durations_sum_an_adjustment_loop(db):
    card = kanbagent.create_card("Kanban", "ideia", "sato", occurred_at="2026-11-01T10:00:00+00:00")
    kanbagent.change_stage(card, "proposta", "hermes", occurred_at="2026-11-01T11:00:00+00:00")
    kanbagent.update_proposal(card, "proposta\n**Critérios de aceite**\n- C1: funciona — verificar: teste", "requisitos", occurred_at="2026-11-01T12:00:00+00:00")
    kanbagent.change_stage(card, "revisao", "requisitos", occurred_at="2026-11-01T13:00:00+00:00")
    kanbagent.change_stage(card, "proposta", "sato", text="ajuste", occurred_at="2026-11-02T13:00:00+00:00")
    kanbagent.change_stage(card, "revisao", "requisitos", occurred_at="2026-11-02T13:30:00+00:00")
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
    job = kanbagent.change_stage(card, "proposta", "sato")
    kanbagent.finish_job(job, error="sem rede")
    kanbagent.change_stage(card, "ideia", "sato")  # proposta → ideia não pede texto
    assert kanbagent.card(card)["ajustes"] == 2
    assert kanbagent.STAGE_LABELS["aprovado"] == "Fila de execução"


def test_moving_to_proposal_queues_hermes_and_locks_the_card(db):
    card = kanbagent.create_card("t", "i", "sato")
    job = kanbagent.change_stage(card, "proposta", "sato")
    assert kanbagent.card(card)["job"]["status"] == "queued"
    for attempt in (lambda: kanbagent.change_stage(card, "ideia", "sato"),
                    lambda: kanbagent.change_stage(card, "descartado", "sato"),
                    lambda: kanbagent.update_proposal(card, "eu escrevo", "sato"),
                    lambda: kanbagent.request_proposal(card)):
        with pytest.raises(kanbagent.InvalidTransition):
            attempt()
    claimed = kanbagent.claim_job()
    assert claimed["id"] == job and kanbagent.claim_job() is None
    kanbagent.job_progress(job, "lendo o card")
    assert kanbagent.card(card)["job"]["progress"] == "lendo o card"
    # o Hermes escreve e manda para revisão: o pedido fecha sozinho e o card destrava
    kanbagent.update_proposal(card, "proposta do hermes\n**Critérios de aceite**\n- C1: funciona — verificar: teste", "requisitos")
    kanbagent.change_stage(card, "revisao", "requisitos")
    assert kanbagent.job(job)["status"] == "done"
    kanbagent.change_stage(card, "proposta", "sato", text="mais curto")
    assert kanbagent.card(card)["job"]["status"] == "queued"


def test_failed_or_stale_job_unlocks_and_can_be_retried(db):
    card = kanbagent.create_card("t", "i", "sato")
    job = kanbagent.change_stage(card, "proposta", "sato")
    kanbagent.claim_job(now="2026-01-01T00:00:00+00:00")
    # rodando há mais de 20 min: conta como morto
    assert kanbagent.card(card)["job"]["status"] == "failed"
    retry = kanbagent.request_proposal(card)
    assert retry != job and kanbagent.job(job)["status"] == "failed"
    kanbagent.finish_job(retry, error="hermes saiu com erro 1")
    item = kanbagent.card(card)
    assert item["job"]["status"] == "failed" and "erro 1" in item["job"]["error"]
    kanbagent.change_stage(card, "ideia", "sato")


def test_empty_proposal_cannot_go_to_review_except_from_sync(db):
    card = kanbagent.create_card("t", "i", "sato")
    kanbagent.change_stage(card, "proposta", "sato")
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.change_stage(card, "revisao", "sato")
    kanbagent.change_stage(card, "revisao", "github-sync")


def repo_card(stage):
    project = kanbagent.create_project("lab", "Lab")
    repo = kanbagent.add_repo_to_project(project, "satoLG/lab")
    return card_at(stage, project_id=project, repo_id=repo)


def test_after_execution_starts_only_code_review_cycle(db):
    card = repo_card("revisao_codigo")
    assert kanbagent.next_stages("revisao_codigo") == ["execucao", "entregue", "descartado"]
    assert kanbagent.next_stages("execucao") == ["revisao_codigo", "descartado"]
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.change_stage(card, "execucao", "sato")
    job = kanbagent.change_stage(card, "execucao", "sato", text="faltou teste")
    assert kanbagent.job(job)["kind"] == "execucao"


def test_execution_needs_repo_and_queues_for_the_exec_worker(db):
    bare = card_at("aprovado")
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.change_stage(bare, "execucao", "sato")
    card = repo_card("aprovado")
    job = kanbagent.change_stage(card, "execucao", "sato")
    assert kanbagent.claim_job("proposta") is None          # cada worker só pega o seu tipo
    assert kanbagent.claim_job("execucao")["id"] == job
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.change_stage(card, "descartado", "sato")  # travado enquanto o Claude trabalha
    kanbagent.change_stage(card, "revisao_codigo", "claude", text="PR aberto")
    assert kanbagent.job(job)["status"] == "done"


def test_progress_is_the_heartbeat_of_long_jobs(db):
    card = repo_card("aprovado")
    job = kanbagent.change_stage(card, "execucao", "sato")
    kanbagent.claim_job("execucao", now="2026-01-01T00:00:00+00:00")
    kanbagent.job_progress(job, "tarefa 3/5 (haiku)")       # sinal de vida agora
    assert kanbagent.card(card)["job"]["status"] == "running"


def test_sync_does_not_move_a_card_while_an_agent_works(db):
    card = repo_card("revisao_codigo")
    kanbagent.change_stage(card, "execucao", "sato", text="reprovado")
    assert kanbagent.advance_to(card, "revisao_codigo", "github-sync") == []
    assert kanbagent.card(card)["etapa_atual"] == "execucao"


def test_approved_card_without_repo_can_still_get_one(db):
    card = kanbagent.create_card("A", "a", "sato")
    kanbagent.change_stage(card, "proposta", "sato")
    while (job := kanbagent.claim_job("proposta")) is not None:
        kanbagent.finish_job(job["id"])
    kanbagent.update_proposal(card, "p\n**Critérios de aceite**\n- C1: funciona — verificar: teste", "requisitos")
    kanbagent.change_stage(card, "revisao", "requisitos")
    kanbagent.change_stage(card, "aprovado", "sato")
    assert kanbagent.card(card)["etapa_atual"] == "aprovado"
    kanbagent.set_repo(card, "sato", novo_repo="satoLG/dino")
    with pytest.raises(kanbagent.InvalidTransition):
        kanbagent.set_repo(card, "sato", repo="satoLG/outro")      # uma vez definido, trava


def test_artifacts_replace_same_name_and_live_beside_the_db(db):
    card = kanbagent.create_card("A", "a", "sato")
    first = kanbagent.artifact(card, kanbagent.add_artifact(card, "claude", "../sprite.png", b"v1"))["path"]
    second = kanbagent.add_artifact(card, "claude", "sprite.png", b"v2")
    item = kanbagent.card(card)
    assert [a["id"] for a in item["artifacts"]] == [second]
    art = kanbagent.artifact(card, second)
    assert open(art["path"], "rb").read() == b"v2" and "kanbagent-files" in art["path"]
    assert not Path(first).exists() and first != art["path"]
    with pytest.raises(ValueError):
        kanbagent.add_artifact(card, "claude", "x", b"")


def test_effort_separates_agent_work_and_attention_from_idle_wait(db):
    T = lambda hh, mm, ss=0: f"2026-11-01T{hh:02d}:{mm:02d}:{ss:02d}+00:00"
    card = kanbagent.create_card("A", "a", "sato", occurred_at=T(10, 0))
    kanbagent.change_stage(card, "proposta", "sato", occurred_at=T(10, 30))
    job = kanbagent.claim_job("proposta", now=T(10, 31))
    kanbagent.finish_job(job["id"], now=T(10, 41))                       # Hermes trabalhou 10 min
    kanbagent.update_proposal(card, "p\n**Critérios de aceite**\n- C1: funciona — verificar: teste", "requisitos", occurred_at=T(10, 45))
    kanbagent.change_stage(card, "revisao", "requisitos", occurred_at=T(11, 0))
    # Sato com o card aberto: avisos a cada 15 s, um aviso repetido 1 s depois e outra sessão 10 min mais tarde
    credits = [kanbagent.add_attention(card, now=T(11, 10, s)) for s in (0, 15, 16)]
    credits.append(kanbagent.add_attention(card, now=T(11, 20)))
    assert credits == [5, 15, 1, 5]                                    # avisar mais vezes não infla
    result = kanbagent.effort(card, now=T(15, 0))
    proposta, revisao = result["por_etapa"]["proposta"], result["por_etapa"]["revisao"]
    assert proposta["total"] == 1800 and proposta["agente"] == 600 and proposta["espera"] == 1200
    assert revisao["total"] == 4 * 3600 and revisao["atencao"] == 26 and revisao["agente"] == 0
    assert revisao["espera"] == 4 * 3600 - 26
    assert result["esforco"] == 600 + 26 and result["total"] == 1800 + proposta["total"] + revisao["total"]
    assert "ideia" in result["por_etapa"] and result["por_etapa"]["ideia"]["espera"] == 1800   # ideia sem ninguém: tudo espera


def test_attention_is_ignored_on_closed_cards_and_never_exceeds_the_stage(db):
    card = kanbagent.create_card("A", "a", "sato", occurred_at="2026-11-01T10:00:00+00:00")
    kanbagent.add_attention(card, now="2026-11-01T10:00:20+00:00")
    assert kanbagent.effort(card, now="2026-11-01T10:00:03+00:00")["por_etapa"]["ideia"]["atencao"] == 3   # no máximo o tempo da etapa
    kanbagent.change_stage(card, "descartado", "sato", occurred_at="2026-11-01T11:00:00+00:00")
    assert kanbagent.add_attention(card, now="2026-11-01T11:05:00+00:00") == 0.0
    assert "descartado" not in kanbagent.effort(card, now="2026-11-02T00:00:00+00:00")["por_etapa"]



def test_spec_parser_reads_criteria_adr_and_doubts():
    from hermes_dashboard import kanbagent_spec as spec
    text = ("**Problema** — x\n**Critérios de aceite**\n- C1: exporta CSV — verificar: teste\n"
            "- **C2**: vírgula entre aspas — verificar: `pytest tests/test_csv.py`\n3. C3) botão ao lado — verificar: visual\n"
            "- nota solta\n**Decisão de arquitetura** — sim: troca X por Y\n**Dúvidas** — qual separador?")
    items = spec.criteria(text)
    assert [(c["id"], c["visual"]) for c in items] == [("C1", False), ("C2", False), ("C3", True)]
    assert items[1]["verificar"] == "`pytest tests/test_csv.py`" and items[0]["texto"] == "exporta CSV"
    assert spec.needs_adr(text) and spec.open_doubts(text) == "qual separador?"
    plain = "**Critérios de aceite**\n- C1: a\n**Decisao de arquitetura**: não\n**Dúvidas** — Nenhuma."
    assert not spec.needs_adr(plain) and spec.open_doubts(plain) is None and spec.criteria(plain)[0]["verificar"] == ""
    assert spec.criteria("sem seções") == [] and spec.criteria(None) == []
    review = "VEREDITO: APROVAR\n- C1: ok — teste\n- **C2**: falha — sem aspas\n"
    assert spec.unmet(items, review) == ["C2"]                     # C3 é visual: fica com o Sato
    assert spec.unmet(items, "- C1: ok\n- C2: ok\n- C1: falha") == ["C1"]   # qualquer falha vence


def test_approval_requires_acceptance_criteria(db):
    card = kanbagent.create_card("A", "a", "sato")
    kanbagent.change_stage(card, "proposta", "sato")
    kanbagent.update_proposal(card, "**Problema** — x\n**Proposta** — y", "requisitos")
    kanbagent.change_stage(card, "revisao", "requisitos")
    with pytest.raises(kanbagent.InvalidTransition, match="critérios de aceite"):
        kanbagent.change_stage(card, "aprovado", "sato")
    kanbagent.change_stage(card, "aprovado", "github-sync")         # o sync espelha o GitHub, não valida
    assert kanbagent.card(card)["etapa_atual"] == "aprovado"



def test_each_agent_acts_only_in_its_role(db):
    card = kanbagent.create_card("A", "a", "hermes")
    kanbagent.change_stage(card, "proposta", "hermes")                 # o Sato Agent chama o Requisitos
    assert kanbagent.card(card)["job"]["kind"] == "proposta"
    for intruder in ("hermes", "revisor", "programador", "planejador"):
        with pytest.raises(kanbagent.InvalidTransition, match="Requisitos"):
            kanbagent.update_proposal(card, "p", intruder)
    kanbagent.update_proposal(card, "p\n**Critérios de aceite**\n- C1: x — verificar: teste", "requisitos")
    kanbagent.change_stage(card, "revisao", "requisitos")
    for intruder in ("requisitos", "hermes", "revisor"):
        with pytest.raises(kanbagent.InvalidTransition, match="Só o Sato aprova"):
            kanbagent.change_stage(card, "aprovado", intruder)
    kanbagent.change_stage(card, "aprovado", "sato")
    stats = kanbagent.team_stats()
    assert stats["requisitos"]["eventos"] == 2 and stats["requisitos"]["cards"] == 1
