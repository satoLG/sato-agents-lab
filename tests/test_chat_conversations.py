import io
import json
import sqlite3

from hermes_dashboard import web_chat
from test_web_chat import private_chat, authorize


def submit(client, headers, conversation, question, request_id=None):
    body = {"robot_id": "guide:hermes", "conversation_id": conversation, "question": question}
    if request_id:
        body["request_id"] = request_id
    return client.post("/api/lab/hermes-chat/jobs", json=body, headers=headers)


def test_conversations_are_durable_private_and_resume_separately(private_chat):
    assert private_chat.get("/api/lab/hermes-chat/conversations").status_code == 401
    headers = authorize(private_chat)
    first, second = "a" * 32, "b" * 32
    for conversation, question in [(first, "Como funciona a VM?"), (second, "Explique a floresta"), (first, "E a CPU?")]:
        result = submit(private_chat, headers, conversation, question)
        assert result.status_code == 202
        assert result.json["job"]["conversation_id"] == conversation
    sessions = private_chat.get("/api/lab/hermes-chat/conversations").json["conversations"]
    assert sessions[0]["title"] == "Como funciona a VM?"
    assert sessions[0]["messages"] == 2 and sessions[0]["pending"] == 2
    assert sessions[1]["title"] == "Explique a floresta"
    for conversation, expected in [(first, 2), (second, 1)]:
        jobs = private_chat.get(f"/api/lab/hermes-chat/history?robot_id=guide:hermes&conversation_id={conversation}").json["jobs"]
        assert len(jobs) == expected
        assert all(job["conversation_id"] == conversation for job in jobs)
    # No new empty record is created just by visiting or listing chats.
    assert len(private_chat.get("/api/lab/hermes-chat/conversations").json["conversations"]) == 2


def test_request_retry_cannot_duplicate_or_replace_a_message(private_chat):
    headers = authorize(private_chat)
    conversation, request_id = "a" * 32, "c" * 32
    accepted = submit(private_chat, headers, conversation, "Olá", request_id)
    repeated = submit(private_chat, headers, conversation, "Olá", request_id)
    assert repeated.json["id"] == accepted.json["id"]
    assert len(private_chat.get("/api/lab/hermes-chat/history?robot_id=guide:hermes").json["jobs"]) == 1
    assert submit(private_chat, headers, conversation, "Outra mensagem", request_id).status_code == 409
    assert submit(private_chat, headers, "../bad", "Olá").status_code == 400
    assert private_chat.get("/api/lab/hermes-chat/history?conversation_id=bad").status_code == 400


def test_additive_migration_keeps_existing_jobs_answers_and_progress(private_chat):
    web_chat.DB_PATH.parent.mkdir(parents=True)
    with sqlite3.connect(web_chat.DB_PATH) as conn:
        conn.execute("""CREATE TABLE jobs (id TEXT PRIMARY KEY,robot_id TEXT,question TEXT,context TEXT,status TEXT,
                     answer TEXT,error TEXT,attempts INTEGER DEFAULT 0,due_at REAL,lease_until REAL,created_at REAL,updated_at REAL)""")
        conn.execute("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", ("d"*32,"guide:hermes","Pergunta antiga","{}","done","Resposta antiga",None,0,1,None,1,2))
    headers = authorize(private_chat)
    for _ in range(2):
        sessions = private_chat.get("/api/lab/hermes-chat/conversations").json["conversations"]
        assert len(sessions) == 1 and sessions[0]["title"] == "Conversa anterior"
    web_chat._progress("d"*32, "done", "Evento antigo")
    jobs = private_chat.get(f"/api/lab/hermes-chat/history?robot_id=guide:hermes&conversation_id={web_chat.LEGACY_CONVERSATION}").json["jobs"]
    assert jobs[0]["answer"] == "Resposta antiga" and jobs[0]["progress"][0]["text"] == "Evento antigo"
    # Old Lab clients can still submit without the new fields.
    response = private_chat.post("/api/lab/hermes-chat/jobs", json={"robot_id":"guide:hermes","question":"Mensagem do Lab"}, headers=headers)
    assert response.status_code == 202 and response.json["conversation_id"] == web_chat.LEGACY_CONVERSATION


def test_long_conversation_can_load_every_page_without_losing_messages(private_chat):
    headers = authorize(private_chat)
    conversation = "a" * 32
    submit(private_chat, headers, conversation, "Primeira")
    with web_chat._connection() as conn:
        conn.execute("UPDATE jobs SET status='done',created_at=1")
        for i in range(1,85):
            conn.execute("INSERT INTO jobs(id,robot_id,question,context,status,due_at,created_at,updated_at,conversation_id) VALUES(?,?,?,?,?,?,?,?,?)",
                         (f"{i:032x}","guide:hermes",f"Mensagem {i}","{}","done",i+1,i+1,i+1,conversation))
    seen, before = [], ""
    while True:
        data = private_chat.get(f"/api/lab/hermes-chat/history?robot_id=guide:hermes&conversation_id={conversation}{before}").json
        seen += [job["id"] for job in data["jobs"]]
        if not data["has_more"]:
            break
        before = "&before=" + data["jobs"][0]["id"]
    assert len(seen) == len(set(seen)) == 85


def test_messages_written_by_old_code_after_migration_are_still_discoverable(private_chat):
    headers = authorize(private_chat)
    submit(private_chat, headers, "a"*32, "Nova sessão")
    with web_chat._connection() as conn:
        conn.execute("INSERT INTO jobs(id,robot_id,question,context,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                     ("e"*32,"guide:hermes","Mensagem do código anterior","{}","done",1,1,1))
    sessions = private_chat.get("/api/lab/hermes-chat/conversations").json["conversations"]
    assert len(sessions) == 2
    assert next(item for item in sessions if item["id"] == web_chat.LEGACY_CONVERSATION)["title"] == "Conversa anterior"


def test_model_context_never_includes_another_conversation(private_chat, monkeypatch):
    headers = authorize(private_chat)
    first, second = "a" * 32, "b" * 32
    submit(private_chat, headers, first, "Segredo da conversa A")
    row = web_chat._claim(); web_chat._finish(row, answer="Resposta A")
    submit(private_chat, headers, second, "Tema da conversa B")
    row = web_chat._claim(); web_chat._finish(row, answer="Resposta B")
    submit(private_chat, headers, second, "Continue B")
    row = web_chat._claim()
    monkeypatch.setattr(web_chat, "_assert_no_tools", lambda: None)
    captured = []
    class Process:
        def __init__(self, *args, **kwargs):
            self.stdin = io.StringIO()
            self.stdout = io.StringIO(json.dumps({"kind":"answer","text":"Continuando B"})+'\n')
            self.stdin.close = lambda: captured.append(json.loads(self.stdin.getvalue()))
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def wait(self): return 0
        def kill(self): pass
    monkeypatch.setattr(web_chat.subprocess, "Popen", Process)
    assert web_chat._answer(row) == "Continuando B"
    assert captured[0]["history"] == [{"role":"user","content":"Tema da conversa B"},{"role":"assistant","content":"Resposta B"}]
