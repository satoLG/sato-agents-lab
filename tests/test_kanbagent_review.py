"""Revisão do PR de um card (Hermes, e Claude quando precisa) e os botões Aprovar/Reprovar."""
import pytest

from hermes_dashboard import kanbagent as kb
from hermes_dashboard import kanbagent_review as worker

PR = "https://github.com/sato/app/pull/7"


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(kb, "DB_PATH", tmp_path / "kanbagent.sqlite3")
    monkeypatch.setattr(worker, "LOCK_PATH", tmp_path / "review.lock")


def delivered(summary="- 1. botão: haiku"):
    """Card que o Claude acabou de entregar (pedido de revisão na fila)."""
    project = kb.create_project("app", "App")
    card = kb.create_card("Botão", "ideia", "sato", project_id=project,
                          repo_id=kb.add_repo_to_project(project, "sato/app"))
    kb.change_stage(card, "proposta", "hermes")
    kb.update_proposal(card, "Botão novo", "hermes")
    for stage, who in (("revisao", "hermes"), ("aprovado", "sato"), ("execucao", "sato")):
        kb.change_stage(card, stage, who)
    kb.finish_job(kb.claim_job("execucao")["id"])
    kb.add_link(card, PR, "claude")
    job = kb.change_stage(card, "revisao_codigo", "claude", text=f"PR pronto: {PR}\n{summary}")
    assert kb.job(job)["kind"] == "revisao_codigo"
    return card


class FakeTools:
    def __init__(self, hermes=(0, "VEREDITO: APROVAR\n- ok"), claude=(0, "VEREDITO: APROVAR\n- ok"), changed=40):
        self.hermes_answer, self.claude_answer, self.changed = hermes, claude, changed
        self.asked, self.comments = [], []

    def pr(self, repo, number):
        assert (repo, number) == ("sato/app", 7)
        return {"title": "Botão", "body": "corpo", "diff": "+botão", "changed": self.changed}

    def hermes(self, prompt, on_event):
        self.asked.append("hermes")
        assert "+botão" in prompt and "Botão novo" in prompt
        return self.hermes_answer

    def claude(self, model, prompt):
        self.asked.append(f"claude:{model}")
        return self.claude_answer

    def comment(self, repo, number, body):
        self.comments.append(body)


def test_small_diff_is_reviewed_by_hermes_alone(db):
    card = delivered()
    tools = FakeTools()
    assert worker.drain(lambda: tools) == 1
    item = kb.card(card)
    review = kb.review(item)
    assert tools.asked == ["hermes"] and review["aprovar"]
    assert item["etapa_atual"] == "revisao_codigo" and tools.comments
    assert any(e["author"] == "hermes" and "VEREDITO: APROVAR" in (e["text"] or "") for e in item["events"])


@pytest.mark.parametrize("changed,summary,expected", [
    (900, "- 1. botão: haiku", ["hermes", "claude:sonnet"]),
    (40, "- 1. migração: opus", ["hermes", "claude:opus"]),
])
def test_big_diff_or_opus_work_gets_a_claude_second_review(db, changed, summary, expected):
    card = delivered(summary)
    tools = FakeTools(claude=(0, "VEREDITO: AJUSTAR\n- falta teste"), changed=changed)
    worker.drain(lambda: tools)
    review = kb.review(kb.card(card))
    assert tools.asked == expected
    assert not review["aprovar"] and "falta teste" in review["texto"]   # um AJUSTAR vence


def test_claude_takes_over_when_hermes_fails(db):
    card = delivered()
    tools = FakeTools(hermes=(1, "rate limit"))
    worker.drain(lambda: tools)
    assert tools.asked == ["hermes", "claude:sonnet"] and kb.review(kb.card(card))["aprovar"]


def test_no_verdict_fails_the_job_and_unlocks(db):
    card = delivered()
    worker.drain(lambda: FakeTools(hermes=(0, "achei legal"), claude=(1, "erro")))
    item = kb.card(card)
    assert item["job"]["status"] == "failed" and kb.review(item) is None
    kb.request_agent(card)   # dá para pedir de novo


# --- botões no card --------------------------------------------------------------------------------

def form(client, target, /, **data):
    return client.post(target, data={"csrf": client.csrf, **data})


def reviewed(verdict="AJUSTAR"):
    card = delivered()
    worker.drain(lambda: FakeTools(hermes=(0, f"VEREDITO: {verdict}\n- trocar a cor")))
    return card


def test_card_shows_review_and_approve_merges_then_delivers(client, monkeypatch):
    card = reviewed("APROVAR")
    page = client.get(f"/kanbagent/card/{card}").get_data(as_text=True)
    assert "Revisão: pode aprovar" in page and "git-merge" in page and "Reprovar" in page
    board = client.get("/kanbagent").get_data(as_text=True)
    assert "#circle-check" in board and "</svg> revisado" in board
    merged = []
    monkeypatch.setattr(worker, "merge", lambda repo, number: merged.append((repo, number)))
    form(client, f"/kanbagent/card/{card}/aprovar")
    item = kb.card(card)
    assert merged == [("sato/app", 7)] and item["etapa_atual"] == "entregue"
    assert item["links"][0]["estado"] == "merged"


def test_failed_merge_keeps_card_in_review(client, monkeypatch):
    card = reviewed("APROVAR")
    monkeypatch.setattr(worker, "merge", lambda repo, number: "checks falhando")
    response = form(client, f"/kanbagent/card/{card}/aprovar")
    assert kb.card(card)["etapa_atual"] == "revisao_codigo"
    assert "checks falhando" in client.get(response.headers["Location"]).get_data(as_text=True)


def test_reject_sends_review_back_to_execution(client):
    card = reviewed()
    page = client.get(f"/kanbagent/card/{card}").get_data(as_text=True)
    assert "pede ajustes" in page and "trocar a cor" in page
    form(client, f"/kanbagent/card/{card}/etapa", para="execucao", texto="trocar a cor")
    item = kb.card(card)
    assert item["etapa_atual"] == "execucao" and item["job"]["kind"] == "execucao"


def test_review_in_progress_locks_card(client):
    card = delivered()
    kb.job_progress(kb.claim_job("revisao_codigo")["id"], "Hermes revisando")
    board = client.get("/kanbagent").get_data(as_text=True)
    assert "revisando…" in board and "Hermes revisando" in board
    response = form(client, f"/kanbagent/card/{card}/aprovar")
    assert kb.card(card)["etapa_atual"] == "revisao_codigo" and response.status_code == 303
