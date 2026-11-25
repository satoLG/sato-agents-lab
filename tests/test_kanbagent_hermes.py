"""Worker que leva os pedidos do kanbagent ao Hermes, com um Hermes falso."""
import pytest

from hermes_dashboard import kanbagent as kb
from hermes_dashboard import kanbagent_hermes as worker


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(kb, "DB_PATH", tmp_path / "kanbagent.sqlite3")
    monkeypatch.setattr(worker, "LOCK_PATH", tmp_path / "worker.lock")


def asked(title="Kanban"):
    card = kb.create_card(title, "ideia crua", "sato")
    kb.change_stage(card, "proposta", "sato")
    return card


def test_hermes_writes_proposal_and_job_closes_with_progress(db):
    card = asked()
    seen = []

    def hermes(prompt, on_event):
        assert f"Card {card} do kanbagent" in prompt and "kanbagent.sh proposal" in prompt
        on_event({"type": "tool_use", "name": "terminal", "input": {"command": f"~/.hermes/scripts/kanbagent.sh card {card}"}})
        seen.append(kb.card(card)["job"]["progress"])
        kb.update_proposal(card, "**Problema** ...", "hermes")
        kb.change_stage(card, "revisao", "hermes")
        return 0, "Proposta gravada."

    assert worker.drain(hermes) == 1
    item = kb.card(card)
    assert seen == ["lendo o card"]
    assert item["etapa_atual"] == "revisao" and item["job"]["status"] == "done"


@pytest.mark.parametrize("result,reason", [
    ((1, "Unsupported option"), "Unsupported option"),
    ((0, "pronto"), "terminou sem gravar"),
])
def test_job_fails_and_unlocks_when_hermes_does_not_deliver(db, result, reason):
    card = asked()
    assert worker.drain(lambda prompt, on_event: result) == 1
    item = kb.card(card)
    assert item["job"]["status"] == "failed" and reason in item["job"]["error"]
    kb.change_stage(card, "ideia", "sato")   # destravou


def test_crash_in_runner_never_leaves_card_locked(db):
    card = asked()

    def broken(prompt, on_event):
        raise RuntimeError("sem memória")

    worker.drain(broken)
    assert kb.card(card)["job"]["status"] == "failed"


def test_drain_takes_every_queued_job_in_order(db):
    first, second = asked("a"), asked("b")
    order = []

    def hermes(prompt, on_event):
        order.append(prompt.split('"')[1])
        return 1, "x"

    assert worker.drain(hermes) == 2 and order == ["a", "b"]
    assert worker.drain(hermes) == 0


def test_missing_hermes_binary_is_a_clear_error(db, tmp_path, monkeypatch):
    monkeypatch.setattr(worker, "HERMES_BIN", tmp_path / "nao-existe")
    code, text = worker.run_hermes("oi", lambda event: None)
    assert code == 127 and "não encontrado" in text


@pytest.mark.parametrize("event,text", [
    ({"type": "tool_use", "name": "terminal", "input": {"command": "cat ~/hermes-private-context/estilo-sato.md"}},
     "lendo o estilo do Sato"),
    ({"type": "tool_use", "name": "terminal", "input": {"command": "~/.hermes/scripts/kanbagent.sh proposal 3 /tmp/p.md"}},
     "gravando a proposta"),
    ({"type": "tool_use", "name": "read_file", "input": {"path": "app.py"}}, "read_file: app.py"),
    ({"type": "text", "text": "oi"}, None),
])
def test_progress_lines_are_short_and_readable(event, text):
    assert worker.describe(event) == text
