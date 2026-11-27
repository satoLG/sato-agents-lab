"""Chat direto com os agentes do time: mensagem pendente, worker que responde por motor, página."""
import pytest

from hermes_dashboard import kanbagent as kb
from hermes_dashboard import kanbagent_chat as chat


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(kb, "DB_PATH", tmp_path / "kanbagent.sqlite3")
    monkeypatch.setattr(chat, "LOCK_PATH", tmp_path / "chat.lock")


def test_send_queues_a_pending_reply_and_blocks_a_second_one(db):
    sato, reply = chat.send("revisor", "  oi  ")
    assert (sato["autor"], sato["texto"], sato["status"]) == ("sato", "oi", "done")
    assert (reply["autor"], reply["status"]) == ("revisor", "pending")
    with pytest.raises(kb.InvalidTransition, match="ainda está respondendo"):
        chat.send("revisor", "e aí?")
    chat.send("planejador", "outra conversa")                    # cada agente tem a sua fila
    with pytest.raises(kb.NotFound):
        chat.send("hermes", "x")
    with pytest.raises(ValueError):
        chat.send("revisor", " ")


def test_worker_answers_with_the_agent_engine_and_role_prompt(db):
    card = kb.create_card("Exportar CSV", "quero CSV", "sato")
    chat.send("requisitos", f"o que falta no #{card}? e no #999")
    chat.send("programador", "qual o plano?")
    seen = []

    def hermes(agent, prompt):
        seen.append((agent, prompt))
        return 0, "Faltam critérios.", 0.0

    def claude(agent, prompt):
        seen.append((agent, prompt))
        return 0, "Ainda sem plano.", 0.04

    assert chat.drain({"hermes": hermes, "claude": claude}) == 2
    (who1, p1), (who2, p2) = seen
    assert who1 == "requisitos" and "agente Requisitos" in p1 and "Exportar CSV" in p1 and "#999: não existe" in p1
    assert "Sato: o que falta" in p1 and "kanbagent.sh card N" in p1
    assert who2 == "programador" and "não tem acesso a repositório" in p2
    assert chat.messages("requisitos")[-1]["texto"] == "Faltam critérios."
    assert chat.chat_cost()["programador"] == pytest.approx(0.04)
    # a próxima pergunta leva a conversa anterior
    chat.send("requisitos", "e agora?")
    chat.drain({"hermes": hermes, "claude": claude})
    assert "Requisitos: Faltam critérios." in seen[-1][1] and "Sato: e agora?" in seen[-1][1]


def test_failures_are_shown_and_old_pending_replies_expire(db):
    chat.send("revisor", "oi", now="2026-11-01T10:00:00+00:00")
    assert chat.messages("revisor", now="2026-11-01T10:30:00+00:00")[-1]["status"] == "failed"
    chat.drain({"hermes": lambda a, p: (1, "rate limit", 0.0), "claude": None})
    last = chat.messages("revisor")[-1]
    assert last["status"] == "failed" and "rate limit" in last["erro"]
    chat.send("revisor", "de novo?")                           # falha libera mandar de novo
