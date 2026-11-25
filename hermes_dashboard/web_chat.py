"""Private, durable, tool-free Hermes questions for the lab robots."""
import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import jsonify, request

from . import auth, config, lab, streaming, chat_context, sato_agent, mimic
from .warm_runner import WarmRunner

LOG = logging.getLogger(__name__)
DB_PATH = Path(os.getenv("HERMES_WEB_CHAT_DB", str(config.HERMES_HOME / "web-chat.sqlite3")))
HERMES_ROOT = Path(os.getenv("HERMES_AGENT_ROOT", str(config.HERMES_HOME / "hermes-agent")))
HERMES_BIN = HERMES_ROOT / "venv/bin/hermes"
HERMES_PYTHON = HERMES_ROOT / "venv/bin/python"
MAX_ATTEMPTS = 3
WORKER_LOCK = threading.Lock()
WORKER_STARTED = False
WORKER_WAKE = threading.Event()
RUNNER = WarmRunner(HERMES_PYTHON, Path(__file__).resolve().parent.parent / 'tools/web_chat_runner.py', HERMES_ROOT)
LEGACY_CONVERSATION = "00000000000000000000000000000001"


def configure(app):
    auth.configure(app)
    if not auth.enabled():
        return
    from flask.logging import default_handler
    for logger in (LOG, auth.LOG, logging.getLogger('hermes_dashboard.warm_runner')):
        if not logger.handlers:
            logger.addHandler(default_handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False


def _connection():
    DB_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=FULL")
    conn.execute("""CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, robot_id TEXT NOT NULL, question TEXT NOT NULL,
        context TEXT NOT NULL, status TEXT NOT NULL, answer TEXT, error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0, due_at REAL NOT NULL,
        lease_until REAL, created_at REAL NOT NULL, updated_at REAL NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
        kind TEXT NOT NULL, text TEXT NOT NULL, created_at REAL NOT NULL
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS progress_job ON progress(job_id, id)")
    conn.execute("""CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, robot_id TEXT NOT NULL, title TEXT NOT NULL,
        created_at REAL NOT NULL, updated_at REAL NOT NULL
    )""")
    conn.commit()
    # Serialize the additive migration across worker and web processes.
    if "conversation_id" not in {column[1] for column in conn.execute("PRAGMA table_info(jobs)")}:
        conn.execute("BEGIN IMMEDIATE")
        if "conversation_id" not in {column[1] for column in conn.execute("PRAGMA table_info(jobs)")}:
            conn.execute(f"ALTER TABLE jobs ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '{LEGACY_CONVERSATION}'")
            previous = conn.execute("SELECT * FROM jobs ORDER BY created_at LIMIT 1").fetchone()
            if previous:
                updated = conn.execute("SELECT MAX(updated_at) FROM jobs").fetchone()[0]
                conn.execute("INSERT INTO conversations VALUES (?,?,?,?,?)",
                             (LEGACY_CONVERSATION, previous["robot_id"], "Conversa anterior", previous["created_at"], updated))
                conn.execute("UPDATE jobs SET conversation_id=?", (LEGACY_CONVERSATION,))
        conn.commit()
    conn.execute("CREATE INDEX IF NOT EXISTS jobs_conversation ON jobs(conversation_id, created_at, id)")
    conn.commit()
    if DB_PATH.exists():
        os.chmod(DB_PATH, 0o600)
    return conn


# Sessão e login moram em auth.py (ADR 0010); o chat só aplica as próprias mensagens.
session_status = auth.session_status
login = auth.login


def _private(write=False):
    if not auth.authorized():
        return jsonify({"error": "Entre para conversar com o Sato Agent."}), 401
    if write and not auth.csrf_ok():
        return jsonify({"error": "Sessão inválida; recarregue a página."}), 403
    return None


def _context(robot_id, snapshot=None, question="", previous=()):
    # This character presents Léo's work. Operational telemetry belongs to the
    # dashboard and must never enter the visitor-facing chat prompt.
    return {"vm_context": sato_agent.context(question, previous)}


def _question_ok(value):
    return isinstance(value, str) and 1 <= len(value.strip()) <= 4000 and not any(ord(c) < 32 and c not in '\n\t' for c in value)


def _conversation_id(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{32}", value)


def _conversation_title(question):
    title = " ".join(question.split())
    return title if len(title) <= 90 else title[:87].rstrip() + "…"


def submit():
    denied = _private(write=True)
    if denied:
        return denied
    if request.content_length and request.content_length > 20000:
        return jsonify({"error": "Pergunta muito grande."}), 413
    data = request.get_json(silent=True)
    robot_id = data.get("robot_id") if isinstance(data, dict) else None
    question = data.get("question") if isinstance(data, dict) else None
    if robot_id != "guide:hermes":
        return jsonify({"error": "Conversa livre disponível apenas no líder do Núcleo."}), 400
    if not _question_ok(question):
        return jsonify({"error": "Envie uma mensagem de até 4000 caracteres."}), 400
    conversation_id = data.get("conversation_id", LEGACY_CONVERSATION)
    job_id = data.get("request_id", uuid.uuid4().hex)
    if not _conversation_id(conversation_id) or not _conversation_id(job_id):
        return jsonify({"error": "Conversa ou mensagem inválida."}), 400
    # Prepare live context when claimed, not twice or while waiting in the queue.
    context = {'robot': {'id': robot_id}, 'prepared_at': None}
    now = time.time()
    conn = _connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if existing:
            if existing["conversation_id"] != conversation_id or existing["question"] != question.strip():
                return jsonify({"error": "Identificador de mensagem já utilizado."}), 409
            return jsonify({"id": job_id, "status": existing["status"], "conversation_id": conversation_id,
                            "job": _public_job(existing, conn)}), 202
        waiting = conn.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running')").fetchone()[0]
        if waiting >= 30:
            conn.rollback()
            return jsonify({"error": "Fila cheia. Tente novamente em alguns minutos."}), 429
        conn.execute("INSERT OR IGNORE INTO conversations VALUES (?,?,?,?,?)",
                     (conversation_id, robot_id, _conversation_title(question), now, now))
        conn.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now, conversation_id))
        conn.execute("INSERT INTO jobs (id,robot_id,question,context,status,due_at,created_at,updated_at,conversation_id) VALUES (?,?,?,?,?,?,?,?,?)",
                     (job_id, robot_id, question.strip(), json.dumps(context, ensure_ascii=False), "queued", now, now, now, conversation_id))
        conn.commit()
        _progress(job_id, "queued", "Mensagem recebida. Preparando sua resposta.")
        accepted = _public_job(conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone(), conn)
    finally:
        conn.close()
    WORKER_WAKE.set()
    return jsonify({"id": job_id, "status": "queued", "conversation_id": conversation_id, "job": accepted}), 202


def _public_job(row, conn=None):
    value = {key: row[key] for key in ("id", "robot_id", "conversation_id", "question", "status", "answer", "error", "attempts", "created_at", "updated_at")}
    try:
        action = json.loads(row['context'])
        if row['status'] == 'done' and mimic.valid_plan(action.get('mimic_plan')):
            value['mimic_plan'] = action['mimic_plan']
            value['mimic_result'] = action.get('mimic_result', {'status': 'planned'})
    except (ValueError, TypeError, AttributeError):
        pass
    owned = conn is None
    conn = conn or _connection()
    try:
        value["progress"] = [dict(event) for event in conn.execute("SELECT id,kind,text,created_at FROM progress WHERE job_id=? ORDER BY id LIMIT 300", (row["id"],))]
    finally:
        if owned:
            conn.close()
    return value


def mimic_result(job_id):
    denied = _private(write=True)
    if denied:
        return denied
    data = request.get_json(silent=True)
    allowed = {'started', 'completed', 'cancelled', 'unavailable'}
    if not isinstance(data, dict) or set(data) != {'status'} or not isinstance(data.get('status'), str) or data['status'] not in allowed:
        return jsonify(error='Resultado inválido.'), 400
    conn = _connection()
    try:
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
        if not row:
            return jsonify(error='Mensagem não encontrada.'), 404
        context = json.loads(row['context'])
        if row['status'] != 'done' or not mimic.valid_plan(context.get('mimic_plan')):
            return jsonify(error='Essa mensagem não tem uma imitação para executar.'), 409
        previous = context.get('mimic_result', {}).get('status', 'planned')
        # A terminal result wins; duplicate/late browser reports are harmless.
        if previous not in {'completed', 'cancelled', 'unavailable'}:
            status = data['status']
            context['mimic_result'] = {'status': status, 'at': time.time()}
            label = context['mimic_plan']['label']
            answer = {'started': f'Estou representando {label} com meu visor e meus braços.',
                      'completed': f'Representei {label} com meu visor e meus braços.',
                      'cancelled': 'A imitação foi interrompida.',
                      'unavailable': 'Não consegui mostrar a imitação agora. Tente de novo quando o robô estiver disponível.'}[status]
            conn.execute('UPDATE jobs SET context=?,answer=?,updated_at=? WHERE id=?',
                         (json.dumps(context, ensure_ascii=False), sato_agent.public_answer(answer), time.time(), job_id))
            conn.commit()
            row = conn.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
        return jsonify(job=_public_job(row, conn))
    finally:
        conn.close()


def _progress(job_id, kind, text):
    conn = _connection()
    try:
        conn.execute("INSERT INTO progress(job_id,kind,text,created_at) VALUES(?,?,?,?)", (job_id, kind, text[:10000], time.time()))
        conn.commit()
    finally:
        conn.close()


def _history_payload(robot_id, conversation_id=None, before=None):
    conn = _connection()
    try:
        query, params = "SELECT * FROM jobs WHERE robot_id=?", [robot_id]
        if conversation_id is not None:
            query += " AND conversation_id=?"
            params.append(conversation_id)
        if before:
            cursor = conn.execute("SELECT created_at,id FROM jobs WHERE id=? AND conversation_id=?", (before, conversation_id)).fetchone()
            if cursor:
                query += " AND (created_at,id)<(?,?)"
                params.extend(cursor)
        rows = conn.execute(query + " ORDER BY created_at DESC,id DESC LIMIT 41", params).fetchall()
        return {"jobs": [_public_job(row, conn) for row in reversed(rows[:40])], "has_more": len(rows) > 40}
    finally:
        conn.close()


def stream():
    denied = _private()
    if denied:
        return denied
    robot_id = request.args.get("robot_id", "")
    if robot_id != "guide:hermes":
        return jsonify({"error": "Robô inválido."}), 400
    conversation_id = request.args.get("conversation_id")
    if conversation_id is not None and not _conversation_id(conversation_id):
        return jsonify({"error": "Conversa inválida."}), 400
    def messages():
        previous = None
        heartbeat = time.monotonic()
        while True:
            payload = json.dumps(_history_payload(robot_id, conversation_id), ensure_ascii=False)
            if payload != previous:
                yield f"event: history\ndata: {payload}\n\n"
                previous = payload
            elif time.monotonic() - heartbeat >= 15:
                yield ": heartbeat\n\n"
                heartbeat = time.monotonic()
            time.sleep(.5)
    return streaming.response(messages())


def job(job_id):
    denied = _private()
    if denied:
        return denied
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        return jsonify({"error": "ID inválido."}), 404
    conn = _connection()
    try:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        return (jsonify(_public_job(row)), 200) if row else (jsonify({"error": "Pergunta não encontrada."}), 404)
    finally:
        conn.close()


def history():
    denied = _private()
    if denied:
        return denied
    robot_id = request.args.get("robot_id", "")
    if len(robot_id) > 100:
        return jsonify({"error": "Robô inválido."}), 400
    conversation_id = request.args.get("conversation_id")
    before = request.args.get("before")
    if conversation_id is not None and not _conversation_id(conversation_id):
        return jsonify({"error": "Conversa inválida."}), 400
    if before is not None and (not conversation_id or not _conversation_id(before)):
        return jsonify({"error": "Mensagem inválida."}), 400
    return jsonify(_history_payload(robot_id, conversation_id, before))


def conversations():
    denied = _private()
    if denied:
        return denied
    conn = _connection()
    try:
        # An older binary can still insert jobs using the column's default
        # during a rollback. Make those records discoverable on the next list.
        conn.execute("""INSERT OR IGNORE INTO conversations
                        SELECT ?, 'guide:hermes', 'Conversa anterior', MIN(created_at), MAX(updated_at)
                        FROM jobs WHERE conversation_id=? HAVING COUNT(*)>0""",
                     (LEGACY_CONVERSATION, LEGACY_CONVERSATION))
        conn.commit()
        rows = conn.execute("""SELECT c.id,c.title,c.created_at,MAX(c.updated_at,MAX(j.updated_at)) AS updated_at,
                               COUNT(j.id) AS messages, SUM(j.status IN ('queued','running')) AS pending
                               FROM conversations c JOIN jobs j ON j.conversation_id=c.id
                               WHERE c.robot_id='guide:hermes' GROUP BY c.id ORDER BY updated_at DESC,c.id""").fetchall()
        return jsonify({"conversations": [dict(row) for row in rows]})
    finally:
        conn.close()


def _claim():
    conn = _connection()
    try:
        now = time.time()
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("UPDATE jobs SET status='queued',due_at=?,updated_at=? WHERE status='running' AND lease_until<? AND attempts<?",
                     (now, now, now, MAX_ATTEMPTS))
        conn.execute("UPDATE jobs SET status='failed',error='Tempo de processamento esgotado.',updated_at=? WHERE status='running' AND lease_until<? AND attempts>=?",
                     (now, now, MAX_ATTEMPTS))
        row = conn.execute("SELECT * FROM jobs WHERE status='queued' AND due_at<=? ORDER BY created_at LIMIT 1", (now,)).fetchone()
        if row:
            conn.execute("UPDATE jobs SET status='running',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=?",
                         (now + 300, now, row["id"]))
        conn.commit()
        return dict(row) if row else None
    finally:
        conn.close()


def _answer(row):
    started = time.monotonic()
    question = row["question"]
    stage = "Conhecendo melhor a sua pergunta."
    _progress(row["id"], "context", stage)
    target = mimic.intent(question)
    if target is not None:
        _progress(row['id'], 'model', 'Pensando em uma forma de imitar isso…')
        def generate(prompt):
            # A schema correction is another bounded model call; keep the
            # existing queue lease valid for that call as well.
            conn = _connection()
            try:
                conn.execute('UPDATE jobs SET lease_until=? WHERE id=? AND status=?',
                             (time.time() + max(300, RUNNER.timeout + 30), row['id'], 'running'))
                conn.commit()
            finally:
                conn.close()
            payload = {'id': row['id'], 'conversation_id': row['conversation_id'],
                       'prompt': prompt, 'history': [], 'root': str(HERMES_ROOT)}
            return RUNNER.run(payload, lambda kind, text: _progress(row['id'], kind, 'Combinando expressão e movimentos…'))
        result = mimic.plan(target, generate)
        if result['plan']:
            conn = _connection()
            try:
                current = conn.execute('SELECT context FROM jobs WHERE id=?', (row['id'],)).fetchone()
                context = json.loads(current['context'])
                context.update(mimic_plan=result['plan'], mimic_result={'status': 'planned'})
                conn.execute('UPDATE jobs SET context=? WHERE id=?', (json.dumps(context, ensure_ascii=False), row['id']))
                conn.commit()
            finally:
                conn.close()
        return sato_agent.public_answer(result['answer'], question)
    conn = _connection()
    try:
        past = conn.execute("SELECT question,answer,context FROM jobs WHERE robot_id=? AND conversation_id=? AND status='done' AND created_at<? ORDER BY created_at DESC LIMIT 8", (row["robot_id"], row["conversation_id"], row["created_at"])).fetchall()
    finally:
        conn.close()
    previous_turns = [{"question": turn["question"], "repository": json.loads(turn["context"]).get("repository")}
                      for turn in past]
    history = []
    for previous in reversed(past):
        history.extend([{"role": "user", "content": previous["question"]}, {"role": "assistant", "content": sato_agent.public_answer(previous["answer"], previous["question"])}])
    context = _context(row["robot_id"], question=question, previous=previous_turns)
    if not context:
        raise RuntimeError('Current VM context unavailable')
    context_seconds = time.monotonic() - started
    local = context.get("vm_context", {})
    if answer := sato_agent.quick_answer(question, local):
        _progress(row["id"], "reply", "Resposta pronta.")
        return answer
    prompt = (
        f"Data desta consulta: {datetime.now(timezone.utc).date().isoformat()} (UTC). "
        + sato_agent.instructions(question)
        + " Para referências a um projeto, use somente as evidências do repositório correspondente. "
        "Preserve datas e não confunda o primeiro commit conhecido com a criação do repositório. "
        "Use Markdown quando ajudar a leitura. Não repita respostas antigas sem conferir os fatos atuais."
    )
    prompt += "\nContexto JSON:\n" + json.dumps(context, ensure_ascii=False)
    prompt += "\nPergunta JSON:\n" + json.dumps(question, ensure_ascii=False)
    payload = {'id': row['id'], 'conversation_id': row['conversation_id'],
               'prompt': prompt, 'history': history, 'root': str(HERMES_ROOT)}
    output = RUNNER.run(payload, lambda kind, text: _progress(row['id'], kind, 'Preparando sua resposta.'))
    targets = local.get("rag", {}).get("target_repositories", [])
    if len(targets) == 1:
        conn = _connection()
        try:
            saved = {**json.loads(row.get("context") or "{}"), "repository": targets[0]}
            conn.execute("UPDATE jobs SET context=? WHERE id=?", (json.dumps(saved), row["id"]))
            conn.commit()
        finally:
            conn.close()
    LOG.info('Hermes chat performance job=%s context_s=%.3f prompt_chars=%s history_messages=%s runner=%s',
             row['id'], context_seconds, len(prompt), len(history), RUNNER.last_metrics)
    return sato_agent.public_answer(output, question)


def _finish(row, answer=None, error=None):
    now = time.time()
    retry = error and row["attempts"] + 1 < MAX_ATTEMPTS
    status = "queued" if retry else "failed" if error else "done"
    conn = _connection()
    try:
        conn.execute("UPDATE jobs SET status=?,answer=?,error=?,due_at=?,lease_until=NULL,updated_at=? WHERE id=? AND status='running'",
                     (status, answer, error, now + 15 * (row["attempts"] + 1) ** 2 if retry else now, now, row["id"]))
        conn.commit()
    finally:
        conn.close()
    _progress(row["id"], "retry" if retry else status, "Nova tentativa agendada." if retry else "Resposta concluída." if not error else error)


def _worker():
    try:
        RUNNER.start()
        chat_context.collect(None, 'rag')
    except Exception:
        LOG.warning('Hermes warm-up unavailable; will retry when a job arrives')
    while True:
        try:
            row = _claim()
            if row:
                try:
                    _progress(row["id"], "running", "Sato Agent está preparando sua resposta.")
                    _finish(row, answer=_answer(row))
                except Exception as exc:
                    LOG.warning("Hermes web chat job %s failed: %s", row["id"], type(exc).__name__)
                    _finish(row, error="Sato Agent indisponível; a pergunta será tentada novamente." if row["attempts"] + 1 < MAX_ATTEMPTS else "Sato Agent indisponível após três tentativas.")
                continue
        except Exception:
            LOG.exception("Hermes web chat worker loop failed")
        WORKER_WAKE.wait(2)
        WORKER_WAKE.clear()


def start_worker():
    global WORKER_STARTED
    if not auth.enabled() or os.getenv("HERMES_WEB_CHAT_WORKER", "1") == "0":
        return
    with WORKER_LOCK:
        if WORKER_STARTED:
            return
        threading.Thread(target=_worker, name="hermes-web-chat", daemon=True).start()
        WORKER_STARTED = True
