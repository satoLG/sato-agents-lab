"""Página e API do kanbagent (docs/kanbagent.md, ADRs 0009 e 0010).

Blueprint fino: traduz HTTP para as funções de `kanbagent`. A página usa a sessão do login do site
(o `before_request` de `app.py` já exigiu sessão e CSRF). A API aceita também
`Authorization: Bearer <KANBAGENT_API_TOKEN>` para o Hermes, que chama pela rede local.
"""
import hmac
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import Blueprint, abort, flash, jsonify, redirect, render_template, request, url_for

from . import kanbagent as kb

bp = Blueprint("kanbagent", __name__, url_prefix="/kanbagent")
LOCAL = ZoneInfo("America/Sao_Paulo")
MAX_TEXT = 20000


# --- autenticação da API por token -----------------------------------------------------------------

def api_token():
    return os.getenv("KANBAGENT_API_TOKEN", "")


def bearer_request():
    return request.path.startswith("/kanbagent/api/") and request.headers.get(
        "Authorization", "").startswith("Bearer ")


def check_bearer():
    """None se o token confere; senão a recusa. Sem token configurado a API por token fica fechada."""
    expected = api_token()
    if not expected:
        return jsonify({"error": "API do kanbagent sem token configurado."}), 503
    sent = request.headers.get("Authorization", "")[len("Bearer "):]
    if not hmac.compare_digest(sent.encode(), expected.encode()):
        return jsonify({"error": "Token inválido."}), 401
    return None


def _author():
    return "hermes" if bearer_request() else "sato"


# --- formatação ------------------------------------------------------------------------------------

def duration(seconds):
    """'3d 4h', '2h 10m', '5m', '< 1m'."""
    if seconds is None:
        return "—"
    seconds = int(seconds)
    days, rest = divmod(seconds, 86400)
    hours, rest = divmod(rest, 3600)
    minutes = rest // 60
    if days:
        return f"{days}d {hours}h" if hours else f"{days}d"
    if hours:
        return f"{hours}h {minutes}m" if minutes else f"{hours}h"
    return f"{minutes}m" if minutes else "< 1m"


def local_time(value):
    if not value:
        return ""
    return datetime.fromisoformat(value).astimezone(LOCAL).strftime("%d/%m/%Y %H:%M")


def since_now(value):
    if not value:
        return None
    return (datetime.now(timezone.utc) - datetime.fromisoformat(value)).total_seconds()


@bp.app_template_filter("kb_duration")
def _duration_filter(seconds):
    return duration(seconds)


@bp.app_template_filter("kb_time")
def _time_filter(value):
    return local_time(value)


@bp.app_template_filter("kb_since")
def _since_filter(value):
    return duration(since_now(value))


# Rótulo de cada movimento nos botões do card e no diálogo do arrastar.
ACTIONS = {
    ("ideia", "proposta"): "✨ Pedir proposta ao Hermes",
    ("proposta", "revisao"): "→ Enviar para revisão",
    ("proposta", "ideia"): "↩ Voltar para ideia",
    ("revisao", "aprovado"): "✓ Aprovar",
    ("revisao", "proposta"): "↺ Pedir ajuste",
    ("revisao", "ideia"): "↩ Voltar para ideia",
    ("aprovado", "execucao"): "▶ Executar agora",
    ("execucao", "revisao_codigo"): "→ Revisão de código",
    ("revisao_codigo", "entregue"): "✓ Entregar",
    ("revisao_codigo", "execucao"): "↺ Reprovar",
}


def action_label(from_stage, to_stage):
    return ACTIONS.get((from_stage, to_stage), f"→ {kb.STAGE_LABELS.get(to_stage, to_stage)}")


def card_moves(item):
    """Etapas para onde este card pode ir agora (proposta vazia ainda não vai para revisão)."""
    moves = kb.next_stages(item["etapa_atual"])
    if item["etapa_atual"] == "proposta" and not (item.get("proposta") or "").strip():
        moves = [to for to in moves if to != "revisao"]
    return moves


@bp.app_context_processor
def _labels():
    return {"kb_labels": kb.STAGE_LABELS, "kb_stages": kb.STAGES, "kb_moves": card_moves,
            "kb_action": action_label, "kb_needs_text": kb.NEEDS_TEXT, "kb_returns": kb.RETURNS}


# --- helpers de formulário -------------------------------------------------------------------------

def _text(name, required=False, limit=MAX_TEXT):
    data = request.get_json(silent=True) if request.is_json else request.form
    value = (data or {}).get(name)
    value = value.strip() if isinstance(value, str) else ""
    if len(value) > limit:
        raise ValueError(f"Campo {name} grande demais.")
    if required and not value:
        raise ValueError(f"Campo {name} é obrigatório.")
    return value


def _int(value):
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _filters():
    return {"project": _int(request.args.get("projeto")), "repo": _int(request.args.get("repo"))}


def _back(card_id=None, error=None):
    if error:
        flash(str(error), "error")
    target = url_for("kanbagent.card_page", card_id=card_id) if card_id else url_for("kanbagent.board")
    return redirect(target, code=303)


# --- páginas ---------------------------------------------------------------------------------------

def _render(template, **context):
    from flask import current_app
    return render_template(template, asset_version=current_app.config.get("ASSET_VERSION", ""), **context)


@bp.get("")
def board():
    filters = _filters()
    items = kb.cards(project_id=filters["project"], repo_id=filters["repo"])
    columns = {stage: [] for stage in kb.STAGES}
    for item in items:
        columns[item["etapa_atual"]].append(item)
    rules = {"labels": {f"{a}>{b}": label for (a, b), label in ACTIONS.items()},
             "needsText": [f"{a}>{b}" for a, b in sorted(kb.NEEDS_TEXT)],
             "returns": [f"{a}>{b}" for a, b in sorted(kb.RETURNS)],
             "stages": kb.STAGE_LABELS}
    return _render("kanbagent/board.html", columns=columns, projects=kb.projects(), filters=filters,
                   show_discarded=request.args.get("descartados") == "1", rules=rules)


@bp.get("/card/<int:card_id>")
def card_page(card_id):
    try:
        item = kb.card(card_id)
    except kb.NotFound:
        abort(404)
    longest = max(item["durations"].values(), default=0) or 1
    return _render("kanbagent/card.html", card=item, projects=kb.projects(), longest=longest)


@bp.get("/projetos")
def projects_page():
    return _render("kanbagent/projects.html", projects=kb.projects())


@bp.get("/metricas")
def metrics_page():
    filters = _filters()
    days = _int(request.args.get("dias")) or 30
    since = datetime.now(timezone.utc) - timedelta(days=days)
    data = kb.metrics(project_id=filters["project"], repo_id=filters["repo"], since=since)
    longest = max((v["media_seconds"] or 0 for v in data["por_etapa"].values()), default=0) or 1
    return _render("kanbagent/metrics.html", m=data, projects=kb.projects(), filters=filters, days=days,
                   longest=longest)


# --- ações da página (POST + redirect) --------------------------------------------------------------

@bp.post("/cards")
def create_card_form():
    try:
        project_id = _int(request.form.get("projeto"))
        repo_id = _int(request.form.get("repo"))
        card_id = kb.create_card(_text("titulo", True, 200), _text("ideia", True), "sato",
                                 project_id=project_id, repo_id=repo_id)
    except (ValueError, kb.NotFound) as error:
        return _back(error=error)
    return _back(card_id)


@bp.post("/card/<int:card_id>/etapa")
def stage_form(card_id):
    try:
        kb.change_stage(card_id, _text("para", True, 40), "sato", text=_text("texto") or None)
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


@bp.post("/card/<int:card_id>/proposta")
def proposal_form(card_id):
    try:
        kb.update_proposal(card_id, _text("proposta", True), "sato")
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


@bp.post("/card/<int:card_id>/comentario")
def comment_form(card_id):
    try:
        kb.add_comment(card_id, "sato", _text("texto", True))
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


@bp.post("/card/<int:card_id>/link")
def link_form(card_id):
    try:
        kb.add_link(card_id, _text("url", True, 500), "sato")
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


@bp.post("/projetos")
def create_project_form():
    try:
        project_id = kb.create_project(_text("slug", True, 60), _text("nome", True, 120), _text("descricao"))
        for full_name in _text("repos").replace(",", " ").split():
            kb.add_repo_to_project(project_id, full_name)
    except (ValueError, kb.NotFound) as error:
        flash(str(error), "error")
    except Exception as error:  # slug repetido (IntegrityError) e afins viram mensagem, não 500
        flash(f"Não deu para criar o projeto: {error}", "error")
    return redirect(url_for("kanbagent.projects_page"), code=303)


@bp.post("/projetos/<int:project_id>/repos")
def add_repo_form(project_id):
    try:
        kb.add_repo_to_project(project_id, _text("repo", True, 200))
    except (ValueError, kb.NotFound) as error:
        flash(str(error), "error")
    return redirect(url_for("kanbagent.projects_page"), code=303)


@bp.post("/sync")
def sync_form():
    from . import kanbagent_sync
    try:
        report = kanbagent_sync.sync()
        flash(f"Sync com o GitHub: {report['moved']} mudança(s) de etapa, {len(report['errors'])} erro(s).", "info")
    except Exception as error:
        flash(f"Sync falhou: {error}", "error")
    return redirect(request.referrer if (request.referrer or "").startswith(request.host_url) else
                    url_for("kanbagent.board"), code=303)


# --- API JSON (Hermes) ------------------------------------------------------------------------------

def _api_error(error):
    if isinstance(error, kb.NotFound):
        return jsonify({"error": str(error)}), 404
    if isinstance(error, kb.InvalidTransition):
        return jsonify({"error": str(error)}), 409
    return jsonify({"error": str(error)}), 400


def _resolve_project(data):
    project = data.get("projeto")
    if project in (None, ""):
        return None
    if isinstance(project, int) or str(project).isdigit():
        return int(project)
    return kb.project_by_slug(str(project))


@bp.get("/api/projects")
def api_projects():
    return jsonify({"projects": kb.projects()})


@bp.post("/api/projects")
def api_create_project():
    data = request.get_json(silent=True) or {}
    try:
        project_id = kb.create_project(str(data.get("slug", "")).strip(), str(data.get("nome", "")).strip(),
                                       str(data.get("descricao", "")).strip())
        for full_name in data.get("repos") or []:
            kb.add_repo_to_project(project_id, str(full_name))
    except Exception as error:
        return _api_error(error)
    return jsonify({"id": project_id}), 201


@bp.get("/api/cards")
def api_cards():
    stage = request.args.get("etapa") or None
    if stage and stage not in kb.STAGES:
        return jsonify({"error": "Etapa desconhecida."}), 400
    try:
        project_id = _resolve_project(request.args)
    except kb.NotFound as error:
        return _api_error(error)
    return jsonify({"cards": kb.cards(project_id=project_id, stage=stage)})


@bp.post("/api/cards")
def api_create_card():
    data = request.get_json(silent=True) or {}
    try:
        project_id = _resolve_project(data)
        repo = data.get("repo")
        repo_id = kb.repo_id(repo) if repo else None
        card_id = kb.create_card(str(data.get("titulo", "")).strip()[:200], str(data.get("ideia", "")).strip(),
                                 _author(), project_id=project_id, repo_id=repo_id)
    except Exception as error:
        return _api_error(error)
    return jsonify({"id": card_id, "url": url_for("kanbagent.card_page", card_id=card_id)}), 201


@bp.get("/api/cards/<int:card_id>")
def api_card(card_id):
    try:
        return jsonify(kb.card(card_id))
    except Exception as error:
        return _api_error(error)


@bp.post("/api/cards/<int:card_id>/proposal")
def api_proposal(card_id):
    """Grava a proposta; com `revisar: true` leva o card até `revisao` (ideia → proposta → revisao)."""
    data = request.get_json(silent=True) or {}
    try:
        kb.update_proposal(card_id, str(data.get("proposta", "")), _author())
        stage = kb.card(card_id)["etapa_atual"]
        if stage == "ideia":
            kb.change_stage(card_id, "proposta", _author())
            stage = "proposta"
        if data.get("revisar") and stage == "proposta":
            kb.change_stage(card_id, "revisao", _author())
    except Exception as error:
        return _api_error(error)
    return jsonify(kb.card(card_id))


@bp.post("/api/cards/<int:card_id>/stage")
def api_stage(card_id):
    data = request.get_json(silent=True) or {}
    try:
        kb.change_stage(card_id, str(data.get("para", "")), _author(), text=data.get("texto"))
    except Exception as error:
        return _api_error(error)
    return jsonify(kb.card(card_id))


@bp.post("/api/cards/<int:card_id>/comments")
def api_comment(card_id):
    data = request.get_json(silent=True) or {}
    try:
        kb.add_comment(card_id, _author(), str(data.get("texto", "")))
    except Exception as error:
        return _api_error(error)
    return jsonify({"ok": True}), 201


@bp.post("/api/cards/<int:card_id>/links")
def api_link(card_id):
    data = request.get_json(silent=True) or {}
    try:
        link_id = kb.add_link(card_id, str(data.get("url", "")), _author())
    except Exception as error:
        return _api_error(error)
    return jsonify({"id": link_id}), 201


@bp.get("/api/metrics")
def api_metrics():
    try:
        project_id = _resolve_project(request.args)
    except kb.NotFound as error:
        return _api_error(error)
    days = _int(request.args.get("dias")) or 30
    return jsonify(kb.metrics(project_id=project_id, since=datetime.now(timezone.utc) - timedelta(days=days)))


@bp.post("/api/sync")
def api_sync():
    from . import kanbagent_sync
    return jsonify(kanbagent_sync.sync())
