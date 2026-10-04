import sqlite3
import subprocess
import os
import time
import io
import json

import pytest
from werkzeug.security import generate_password_hash

from app import app
from hermes_dashboard import web_chat


@pytest.fixture
def private_chat(tmp_path, monkeypatch):
    monkeypatch.setattr(web_chat, "ENABLED", True)
    monkeypatch.setattr(web_chat, "PASSWORD_HASH", generate_password_hash("senha-forte-de-teste"))
    monkeypatch.setattr(web_chat, "DB_PATH", tmp_path / "private" / "queue.db")
    monkeypatch.setattr(web_chat.chat_context.vm, "snapshot", lambda **_: {"cpu": {"total": 42}})
    monkeypatch.setattr(web_chat.chat_context.memory, "catalog", lambda: {"documents": [], "skills": []})
    monkeypatch.setattr(web_chat.chat_context.rag, "catalog", lambda: {"docs": [], "total": 0})
    monkeypatch.setattr(web_chat.lab, "snapshot", lambda: {
        "now": "2026-09-23T12:00:00Z", "metrics": {"cpu": 42, "memory": 61, "processes": 3},
        "workers": [{"id": "guide:hermes", "name": "Hermes", "sector": "hermes", "kind": "guide", "status": "observed", "description": "Núcleo", "facts": ["CPU real"]}],
    })
    app.secret_key = "test-session-secret"
    app.config.update(TESTING=True, SESSION_COOKIE_SECURE=False)
    with app.test_client() as client:
        yield client


def authorize(client):
    response = client.post("/api/lab/hermes-chat/login", json={"password": "senha-forte-de-teste"})
    assert response.status_code == 200
    return {"X-Chat-CSRF": response.get_json()["csrf"]}


def test_private_queue_requires_login_csrf_and_informational_question(private_chat):
    url = "/api/lab/hermes-chat/jobs"
    body = {"robot_id": "guide:hermes", "question": "Me explique a formação das estrelas"}
    assert private_chat.post(url, json=body).status_code == 401
    assert private_chat.post("/api/lab/hermes-chat/login", json={"password": "errada"}).status_code == 401
    headers = authorize(private_chat)
    assert private_chat.post(url, json=body).status_code == 403
    assert private_chat.post(url, json=body, headers={**headers, "Origin": "https://evil.test"}).status_code == 403
    assert private_chat.post(url, json={**body, "robot_id": "guide:vm"}, headers=headers).status_code == 400
    assert private_chat.post(url, json={**body, "question": ""}, headers=headers).status_code == 400
    accepted = private_chat.post(url, json=body, headers=headers)
    assert accepted.status_code == 202
    item = private_chat.get(f"{url}/{accepted.get_json()['id']}").get_json()
    assert item["status"] == "queued" and item["question"] == body["question"]
    if os.name != "nt":
        assert web_chat.DB_PATH.stat().st_mode & 0o777 == 0o600


def test_queue_recovers_a_crashed_worker_and_keeps_history(private_chat, monkeypatch):
    headers = authorize(private_chat)
    created = private_chat.post("/api/lab/hermes-chat/jobs", json={"robot_id": "guide:hermes", "question": "O que a VM faz?"}, headers=headers).get_json()["id"]
    row = web_chat._claim()
    assert row["id"] == created
    conn = sqlite3.connect(web_chat.DB_PATH)
    conn.execute("UPDATE jobs SET lease_until=? WHERE id=?", (time.time() - 1, created))
    conn.commit(); conn.close()
    recovered = web_chat._claim()
    assert recovered["id"] == created
    web_chat._finish(recovered, answer="A VM usa CPU e RAM.")
    jobs = private_chat.get("/api/lab/hermes-chat/history?robot_id=guide:hermes").get_json()["jobs"]
    assert jobs[0]["status"] == "done" and jobs[0]["answer"] == "A VM usa CPU e RAM."


def test_hermes_invocation_has_no_tools_and_no_shell(private_chat, monkeypatch):
    calls = []
    def run(argv, **kwargs):
        calls.append((argv, kwargs))
        return subprocess.CompletedProcess(argv, 0, "", "")
    monkeypatch.setattr(web_chat.subprocess, "run", run)
    class Process:
        def __init__(self, argv, **kwargs):
            calls.append((argv, kwargs)); self.stdin=io.StringIO()
            self.stdout=io.StringIO(json.dumps({"kind":"model","text":"Consultando modelo"})+'\n'+json.dumps({"kind":"answer","text":"CPU em 42%."})+'\n')
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def wait(self): return 0
        def kill(self): pass
    monkeypatch.setattr(web_chat.subprocess, "Popen", Process)
    headers=authorize(private_chat)
    created=private_chat.post('/api/lab/hermes-chat/jobs',json={"robot_id":"guide:hermes","question":"Qual a CPU?"},headers=headers).get_json()['id']
    row=web_chat._claim()
    assert web_chat._answer(row) == "CPU em 42%."
    assert "get_tool_definitions" in calls[0][0][-1]
    assert calls[1][0][1].endswith('web_chat_runner.py')
    assert isinstance(calls[1][0], list) and not calls[1][1].get('shell')
    job=private_chat.get('/api/lab/hermes-chat/jobs/'+created).get_json()
    assert any(event['kind']=='model' for event in job['progress'])


def test_progress_stream_is_private_and_preserves_intermediate_events(private_chat):
    assert private_chat.get('/api/lab/hermes-chat/stream?robot_id=guide:hermes').status_code==401
    headers=authorize(private_chat)
    created=private_chat.post('/api/lab/hermes-chat/jobs',json={'robot_id':'guide:hermes','question':'Olá'},headers=headers).get_json()['id']
    web_chat._progress(created,'model','Consultando modelo')
    response=private_chat.get('/api/lab/hermes-chat/stream?robot_id=guide:hermes',buffered=False)
    event=next(response.response).decode()
    response.close()
    assert 'event: history' in event and 'Consultando modelo' in event


@pytest.mark.parametrize('kind', ['tool.started', 'tool.completed'])
def test_server_kills_a_runner_that_reports_tool_activity(private_chat, monkeypatch, kind):
    monkeypatch.setattr(web_chat, '_assert_no_tools', lambda: None)
    killed = []
    class Process:
        def __init__(self, *_, **__):
            self.stdin = io.StringIO()
            self.stdout = io.StringIO(json.dumps({'kind': kind, 'text': 'terminal'}) + '\n')
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def kill(self): killed.append(True)
    monkeypatch.setattr(web_chat.subprocess, 'Popen', Process)
    headers = authorize(private_chat)
    private_chat.post('/api/lab/hermes-chat/jobs', json={'robot_id': 'guide:hermes', 'question': 'Explique a VM'}, headers=headers)
    with pytest.raises(RuntimeError, match='isolation failed'):
        web_chat._answer(web_chat._claim())
    assert killed == [True]
