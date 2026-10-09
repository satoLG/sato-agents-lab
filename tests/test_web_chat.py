import sqlite3
import subprocess
import os
import time
import io
import json
from collections import defaultdict, deque

import pytest
from werkzeug.security import generate_password_hash

from app import app
from hermes_dashboard import web_chat


@pytest.fixture
def private_chat(tmp_path, monkeypatch):
    monkeypatch.setattr(web_chat, "LOGIN_ATTEMPTS", defaultdict(deque))
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


def test_hermes_invocation_passes_current_context_to_warm_runner(private_chat, monkeypatch):
    calls = []
    def run(payload, on_event):
        calls.append(payload)
        on_event('isolation', 'Ferramentas desabilitadas')
        on_event('model', 'Consultando modelo')
        return 'CPU em 42%.'
    monkeypatch.setattr(web_chat.RUNNER, 'run', run)
    headers=authorize(private_chat)
    created=private_chat.post('/api/lab/hermes-chat/jobs',json={'robot_id':'guide:hermes','question':'Qual a CPU?'},headers=headers).get_json()['id']
    assert web_chat._answer(web_chat._claim()) == 'CPU em 42%.'
    assert calls[0]['id'] == created and '42' in calls[0]['prompt']
    assert calls[0]['history'] == []
    job=private_chat.get('/api/lab/hermes-chat/jobs/'+created).get_json()
    assert any(event['kind']=='isolation' for event in job['progress'])
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


def test_submit_does_not_prepare_or_capture_stale_vm_context(private_chat,monkeypatch):
    def unavailable(*args,**kwargs):raise AssertionError('Context must be collected by the worker')
    monkeypatch.setattr(web_chat,'_context',unavailable)
    headers=authorize(private_chat)
    result=private_chat.post('/api/lab/hermes-chat/jobs',json={'robot_id':'guide:hermes','question':'CPU agora?'},headers=headers)
    assert result.status_code==202
    row=web_chat._claim()
    assert json.loads(row['context'])['prepared_at'] is None
    monkeypatch.setattr(web_chat,'_context',lambda *args,**kwargs:None)
    with pytest.raises(RuntimeError,match='Current VM context unavailable'):web_chat._answer(row)
