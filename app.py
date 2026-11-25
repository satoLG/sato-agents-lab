"""Sato Agent companion and Hermes dashboard.

A coleta de dados mora no pacote hermes_dashboard/; aqui ficam so as rotas.
Rodar com: python3 app.py  (ou gunicorn app:app)
"""
import hashlib
import os
import traceback
from pathlib import Path

from urllib.parse import quote

from flask import Flask, abort, jsonify, redirect, render_template, request
from werkzeug.exceptions import NotFound

from hermes_dashboard import activity, auth, cron, lab, mcp, memory, rag, stats, tools, vm, web_chat, webhooks
from hermes_dashboard import db
from hermes_dashboard import config, lab_feed, streaming, sato_agent, mimic
from hermes_dashboard import kanbagent_web

app = Flask(__name__)
web_chat.configure(app)

# A version in the path also versions relative ES-module imports and assets.
# Reusing an unversioned module can pair cached JavaScript with today's HTML.
_static_root = Path(app.static_folder)
_asset_files = sorted(path for path in _static_root.rglob('*') if path.is_file())
_asset_digest = hashlib.sha256()
for _path in [Path(app.root_path) / 'templates/home.html', Path(app.root_path) / 'templates/dashboard.html',
              Path(app.root_path) / 'templates/login.html', *_asset_files]:
    _asset_digest.update(str(_path.relative_to(app.root_path)).replace('\\', '/').encode())
    _asset_digest.update(b'\0')
    _asset_digest.update(_path.read_bytes())
ASSET_VERSION = _asset_digest.hexdigest()[:16]
app.config["ASSET_VERSION"] = ASSET_VERSION
app.register_blueprint(kanbagent_web.bp)

# ADR 0010: só a home e o chat dela são públicos. Qualquer outra rota, inclusive
# as que ainda vão nascer, exige a sessão do login do site.
PUBLIC_PATHS = frozenset({"/", "/login", "/logout", "/api/lab/chat"})
PUBLIC_PREFIXES = ("/assets/", "/static/", "/api/lab/hermes-chat/", "/api/sato-agent/")
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def is_public(path):
    return path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES)


@app.before_request
def require_login():
    path = request.path
    # A API do kanbagent também aceita o token do Sato Agent (Bearer), sem sessão.
    if kanbagent_web.bearer_request():
        return kanbagent_web.check_bearer()
    # Caminho inexistente segue para o 404 normal; não há o que proteger.
    if is_public(path) or isinstance(request.routing_exception, NotFound):
        return None
    try:
        api = path.startswith(("/api/", "/fragments/", "/kanbagent/api/"))
        if not auth.enabled():
            if api:
                return jsonify({"error": "Login não configurado."}), 503
            return render_template("login.html", asset_version=ASSET_VERSION, available=False, next_path="/"), 503
        if not auth.authorized():
            if api or request.method not in SAFE_METHODS:
                return jsonify({"error": "Entre para acessar."}), 401
            target = path + ("?" + request.query_string.decode("utf-8", "replace") if request.query_string else "")
            return redirect("/login?next=" + quote(auth.safe_next(target), safe="/"), code=302)
        if request.method not in SAFE_METHODS and not auth.csrf_ok():
            return jsonify({"error": "Sessão inválida; recarregue a página."}), 403
    except Exception:
        # A checagem nunca abre a rota nem vira um 500 genérico.
        app.logger.exception("falha ao verificar a sessão em %s", path)
        return jsonify({"error": "Login indisponível. Tente novamente."}), 503
    return None


@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "-1"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.errorhandler(Exception)
def handle_unexpected(error):
    """Rede de seguranca: um painel que quebra nao pode derrubar a pagina.

    Sem isso, qualquer excecao nao prevista num coletor virava uma tela de erro
    do Flask sem explicacao nenhuma pra quem esta olhando o dashboard.
    """
    from werkzeug.exceptions import HTTPException
    if isinstance(error, HTTPException):
        return error
    app.logger.exception("erro nao tratado em %s", request.path)
    if request.path.startswith("/api/lab/hermes-chat"):
        return jsonify({"error": "Chat indisponível. Tente novamente."}), 500
    detail = f"{type(error).__name__}: {error}"
    if request.path.startswith("/api/"):
        return jsonify({"error": detail}), 500
    if request.path.startswith("/fragments/"):
        return render_template("fragments/error.html", detail=detail), 200
    return render_template("error.html", detail=detail,
                           trace=traceback.format_exc()), 500


def json_guard(producer, empty):
    """Roda o coletor e devolve `empty` + mensagem quando o banco nao esta la."""
    try:
        return jsonify(producer())
    except db.DatabaseUnavailable as e:
        return jsonify(dict(empty, error=str(e)))


# --- companion ---

@app.route("/")
def home():
    return render_template("home.html", asset_version=ASSET_VERSION)


@app.route("/api/stats")
def api_stats():
    return jsonify(stats.public_stats())


# --- login do site ---

@app.get("/login")
def login_page():
    next_path = auth.safe_next(request.args.get("next"))
    if auth.authorized():
        return redirect(next_path, code=302)
    available = auth.enabled()
    return render_template("login.html", asset_version=ASSET_VERSION, available=available,
                           next_path=next_path), 200 if available else 503


@app.post("/logout")
def logout():
    denied = auth.logout()
    return denied if denied else redirect("/", code=303)


# --- dashboard ---

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html", asset_version=ASSET_VERSION, stats=stats.public_stats(),
                           models=stats.models_config(),
                           paths={"db": str(config.DB_PATH), "rag": str(config.RAG_PATH)})


# --- aba: atividade ---

@app.route("/assets/<version>/<path:filename>")
def versioned_asset(version, filename):
    if version != ASSET_VERSION:
        abort(404)
    return app.send_static_file(filename)


@app.route("/api/lab/state")
def api_lab_state():
    return jsonify(lab.snapshot())


@app.get("/api/lab/stream")
def api_lab_stream():
    return streaming.response(lab_feed.feed.messages())


@app.get("/api/lab/hermes-chat/stream")
def api_hermes_chat_stream():
    return web_chat.stream()


@app.post("/api/lab/chat")
def api_lab_chat():
    if request.content_length and request.content_length > 4096:
        return jsonify({"error": "mensagem muito grande"}), 413
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "envie robot_id e question em JSON"}), 400
    robot_id, question = data.get("robot_id"), data.get("question")
    if not isinstance(robot_id, str) or not isinstance(question, str) or not question.strip() or len(question) > 500 or len(robot_id) > 100:
        return jsonify({"error": "robô e pergunta obrigatórios; máximo de 500 caracteres"}), 400
    response = lab.answer(robot_id, question.strip())
    return (jsonify(response), 200) if response else (jsonify({"error": "Este robô não está mais no snapshot. Atualize o laboratório."}), 404)


@app.get("/api/sato-agent/suggestions")
def api_sato_agent_suggestions():
    return jsonify(sato_agent.suggestions())


@app.get("/api/sato-agent/mimic/tools")
def api_sato_mimic_tools():
    return jsonify(mimic.CAPABILITIES)


@app.post("/api/lab/hermes-chat/jobs/<job_id>/mimic-result")
def api_sato_mimic_result(job_id):
    return web_chat.mimic_result(job_id)


@app.get("/api/lab/hermes-chat/session")
def api_hermes_chat_session():
    return web_chat.session_status()


@app.post("/api/lab/hermes-chat/login")
def api_hermes_chat_login():
    return web_chat.login()


@app.post("/api/lab/hermes-chat/jobs")
def api_hermes_chat_submit():
    return web_chat.submit()


@app.get("/api/lab/hermes-chat/jobs/<job_id>")
def api_hermes_chat_job(job_id):
    return web_chat.job(job_id)


@app.get("/api/lab/hermes-chat/history")
def api_hermes_chat_history():
    return web_chat.history()


@app.get("/api/lab/hermes-chat/conversations")
def api_hermes_chat_conversations():
    return web_chat.conversations()

@app.route("/api/activity/heatmap")
def api_heatmap():
    days = max(30, min(731, request.args.get("days", 365, type=int)))
    kinds = [k for k in request.args.get("kinds", "").split(",") if k]
    return json_guard(lambda: activity.heatmap(days, kinds or None),
                      {"days": [], "max": 0, "total": 0, "series": []})


@app.route("/api/activity/day/<date>")
def api_activity_day(date):
    kinds = [k for k in request.args.get("kinds", "").split(",") if k]
    return json_guard(lambda: activity.day_activity(date, kinds or None),
                      {"date": date, "events": [], "count": 0, "by_kind": {}})


@app.route("/api/live")
def api_live():
    return jsonify(activity.live_snapshot())


@app.route("/fragments/live")
def fragment_live():
    """Fragmento HTML para o htmx trocar sozinho no topo da aba de atividade."""
    return render_template("fragments/live.html", live=activity.live_snapshot())


# --- aba: Sistema (API mantem /api/vmstats por compatibilidade) ---

@app.route("/api/vmstats")
def api_vmstats():
    breakdown = request.args.get("breakdown", "1") != "0"
    return jsonify(vm.snapshot(with_breakdown=breakdown))


# --- aba: tools ---

@app.route("/api/tools")
def api_tools():
    days = max(1, min(365, request.args.get("days", 30, type=int)))
    return jsonify(tools.catalog(days))


# --- aba: MCPs ---

@app.route("/api/mcps")
def api_mcps():
    days = max(1, min(365, request.args.get("days", 30, type=int)))
    return jsonify(mcp.servers(days))


# --- aba: memoria ---

@app.route("/api/memory")
def api_memory():
    return jsonify(memory.catalog())


@app.route("/api/memory/doc")
def api_memory_doc():
    path = request.args.get("path", "")
    if not path:
        return jsonify({"error": "parametro path obrigatorio"}), 400
    try:
        return jsonify(memory.read_document(path))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except OSError as e:
        return jsonify({"error": str(e)}), 500


# --- aba: RAG ---

@app.route("/api/rag/graph")
def api_rag_graph():
    return jsonify(rag.graph(request.args.get("parent") or None))


@app.route("/api/rag/list")
def api_rag_list():
    data = rag.catalog()
    if request.args.get("summary") == "1":
        data.pop("docs", None)
    return jsonify(data)


@app.route("/api/rag/search")
def api_rag_search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"query": "", "hits": [], "graph": None,
                        "error": "informe um termo de busca"})
    limit = max(1, min(50, request.args.get("limit", 12, type=int)))
    return jsonify(rag.search_result(q, limit))


# --- aba: cron ---

@app.route("/api/events")
def api_events():
    from hermes_dashboard import events
    return jsonify(events.overview())


@app.route("/api/cronjobs")
def api_cronjobs():
    return jsonify(cron.overview())


@app.route('/api/webhooks')
def api_webhooks():
    return jsonify(webhooks.overview())


# --- compatibilidade com a versao anterior da API ---

@app.route("/api/models")
def api_models():
    return jsonify(stats.models_config())


@app.route("/api/status")
def api_status():
    live = activity.live_snapshot()
    return jsonify({
        "busy": live["busy"],
        "recent": live["events"],
        "processes": live["processes"],
        "uptime_seconds": vm.uptime_seconds(),
        "timestamp": live["now"],
    })


@app.route("/api/recent")
def api_recent():
    limit = max(1, min(500, request.args.get("limit", 50, type=int)))
    try:
        rows = db.query(
            """SELECT timestamp, tool_name, duration_ms, success, error
               FROM tool_calls ORDER BY id DESC LIMIT ?""", (limit,))
        models = db.query(
            """SELECT timestamp, provider, model, input_tokens, output_tokens,
                      cost_usd, latency_ms, fallback_reason
               FROM model_usage ORDER BY id DESC LIMIT ?""", (limit,))
    except db.DatabaseUnavailable as e:
        return jsonify({"tools": [], "models": [], "error": str(e)})
    return jsonify({"tools": rows, "models": models})


@app.route("/api/day/<date>")
def api_day(date):
    return json_guard(lambda: activity.day_activity(date),
                      {"date": date, "events": [], "count": 0})


web_chat.start_worker()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8080)))
