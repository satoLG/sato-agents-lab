"""Página e API do kanbagent (docs/kanbagent.md, ADRs 0009 e 0010).

Blueprint fino: traduz HTTP para as funções de `kanbagent`. A página usa a sessão do login do site
(o `before_request` de `app.py` já exigiu sessão e CSRF). A API aceita também
`Authorization: Bearer <KANBAGENT_API_TOKEN>` para o Hermes, que chama pela rede local.
"""
import hmac
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import Blueprint, abort, flash, jsonify, redirect, render_template, request, send_file, url_for

from . import kanbagent as kb
from . import kanbagent_team as team
from . import kanbagent_avatars, kanbagent_exec, kanbagent_github, kanbagent_hermes, kanbagent_review

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
    """Pela API: o agente Hermes que se identifica (`X-Kanbagent-Agent`, perfis do time) ou o Sato Agent
    principal. Na página: o Sato."""
    if not bearer_request():
        return "sato"
    claimed = (request.headers.get("X-Kanbagent-Agent") or "").strip().lower()
    return claimed if claimed in team.HERMES_AGENTS else "hermes"


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
# Movimento → (ícone Lucide, palavra do botão, tooltip). ADR 0011: uma palavra por botão.
ACTIONS = {
    ("ideia", "proposta"): ("sparkles", "Propor", "Pedir proposta ao Hermes"),
    ("proposta", "revisao"): ("send", "Revisar", "Enviar para revisão"),
    ("proposta", "ideia"): ("undo-2", "Voltar", "Voltar para ideia"),
    ("revisao", "aprovado"): ("check", "Aprovar", "Aprovar a proposta"),
    ("revisao", "proposta"): ("rotate-ccw", "Ajustar", "Pedir ajuste na proposta"),
    ("revisao", "ideia"): ("undo-2", "Voltar", "Voltar para ideia"),
    ("aprovado", "execucao"): ("play", "Executar", "Executar agora"),
    ("execucao", "revisao_codigo"): ("arrow-right", "Revisar", "Mandar para revisão de código"),
    ("revisao_codigo", "entregue"): ("circle-check", "Entregar", "Marcar como entregue"),
    ("revisao_codigo", "execucao"): ("undo-2", "Reprovar", "Reprovar e voltar para execução"),
}


def action(from_stage, to_stage):
    """(ícone, palavra, tooltip) do botão que leva o card de uma etapa à outra."""
    label = kb.STAGE_LABELS.get(to_stage, to_stage)
    return ACTIONS.get((from_stage, to_stage), ("arrow-right", "Mover", f"Mover para {label}"))


def action_label(from_stage, to_stage):
    return action(from_stage, to_stage)[2]


def card_moves(item):
    """Etapas para onde este card pode ir agora (proposta vazia ainda não vai para revisão)."""
    moves = kb.next_stages(item["etapa_atual"])
    if item["etapa_atual"] == "proposta" and not (item.get("proposta") or "").strip():
        moves = [to for to in moves if to != "revisao"]
    return moves


@bp.app_context_processor
def _labels():
    return {"kb_labels": kb.STAGE_LABELS, "kb_stages": kb.STAGES, "kb_moves": card_moves,
            "kb_action": action, "kb_needs_text": kb.NEEDS_TEXT, "kb_returns": kb.RETURNS,
            "kb_job_text": JOB_TEXT, "kb_review": kb.review, "kb_avatar": avatar_url,
            "kb_user_stages": kb.USER_STAGES}


def avatar_url(author):
    if author not in kanbagent_avatars.DEFAULTS:
        author = "sato"
    return url_for("kanbagent.avatar", author=author, v=kanbagent_avatars.version(author))


# Tipo de pedido → (selo enquanto trabalha, quem está fazendo o quê, selo de falha).
JOB_TEXT = {
    "proposta": ("propondo…", "O Hermes está escrevendo a proposta", "Hermes falhou"),
    "execucao": ("executando…", "O Claude está executando o card (plano em mini tarefas, PR no fim)", "Execução falhou"),
    "revisao_codigo": ("revisando…", "O Hermes está revisando o PR", "Revisão falhou"),
}


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


NEW_REPO = "__novo__"


def _repo_fields():
    """Repositório escolhido no formulário: (`owner/repo` existente, repo novo a criar, público?)."""
    choice = _text("repo", limit=200)
    if choice != NEW_REPO:
        return choice or None, None, False
    name = _text("novo_repo", True, 140)
    if "/" not in name:
        login, _ = kanbagent_github.repos()
        if not login:
            raise ValueError("Escreva o repositório novo como dono/nome.")
        name = f"{login}/{name}"
    return None, name, request.form.get("publico") == "1"


def _github_context():
    login, repos = kanbagent_github.repos()
    return {"gh_login": login, "gh_repos": repos}


@bp.get("")
def board():
    filters = _filters()
    items = kb.cards(project_id=filters["project"], repo_id=filters["repo"])
    columns = {stage: [] for stage in kb.STAGES}
    for item in items:
        columns[item["etapa_atual"]].append(item)
    rules = {"labels": {f"{a}>{b}": tip for (a, b), (_, _, tip) in ACTIONS.items()},
             "needsText": [f"{a}>{b}" for a, b in sorted(kb.NEEDS_TEXT)],
             "returns": [f"{a}>{b}" for a, b in sorted(kb.RETURNS)],
             "stages": kb.STAGE_LABELS}
    show_discarded = request.args.get("descartados") == "1"
    total_cost = sum(i["custo"] for i in items if show_discarded or i["etapa_atual"] != "descartado")
    return _render("kanbagent/board.html", columns=columns, projects=kb.projects(), filters=filters,
                   show_discarded=show_discarded, rules=rules, total_cost=total_cost, **_github_context())


@bp.get("/card/<int:card_id>")
def card_page(card_id):
    try:
        item = kb.card(card_id)
    except kb.NotFound:
        abort(404)
    longest = max(item["durations"].values(), default=0) or 1
    return _render("kanbagent/card.html", card=item, projects=kb.projects(), longest=longest,
                   **(_github_context() if kb.repo_editable(item) else {}))


@bp.get("/projetos")
def projects_page():
    return _render("kanbagent/projects.html", projects=kb.projects())


@bp.get("/time")
def team_page():
    busy = team.status(kb.open_jobs())
    return _render("kanbagent/team.html", agents=team.team(), busy=busy, stats=kb.team_stats())


@bp.get("/ajustes")
def settings_page():
    names = kanbagent_avatars.NAMES
    return _render("kanbagent/settings.html", avatars=list(names.items()),
                   custom={a: kanbagent_avatars.custom(a) is not None for a in names})


@bp.get("/avatar/<author>")
def avatar(author):
    try:
        path, mimetype = kanbagent_avatars.path(author)
    except kb.NotFound:
        abort(404)
    response = send_file(path, mimetype=mimetype, max_age=86400)
    response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
    return response


@bp.post("/avatares/<author>")
def avatar_upload(author):
    upload = request.files.get("imagem")
    try:
        kanbagent_avatars.save(author, upload.read(kanbagent_avatars.MAX_SIZE + 1) if upload else b"")
    except kb.NotFound:
        abort(404)
    except ValueError as error:
        flash(str(error), "error")
    else:
        flash(f"Imagem de {kanbagent_avatars.NAMES[author]} trocada.", "ok")
    return redirect(url_for("kanbagent.settings_page"))


@bp.post("/avatares/<author>/padrao")
def avatar_reset(author):
    try:
        kanbagent_avatars.reset(author)
    except kb.NotFound:
        abort(404)
    flash(f"{kanbagent_avatars.NAMES[author]} voltou para a imagem padrão.", "ok")
    return redirect(url_for("kanbagent.settings_page"))


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
        repo, novo, publico = _repo_fields()
        card_id = kb.create_card(_text("titulo", True, 200), _text("ideia", True), "sato",
                                 project_id=project_id, repo=repo, novo_repo=novo, publico=publico)
    except (ValueError, kb.NotFound) as error:
        return _back(error=error)
    return _back(card_id)


@bp.post("/card/<int:card_id>/etapa")
def stage_form(card_id):
    try:
        _kick(kb.change_stage(card_id, _text("para", True, 40), "sato", text=_text("texto") or None))
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


def approve(card_id):
    """Aprovar a revisão: merge (squash) do PR ligado e card em Entregue."""
    item = kb.card(card_id)
    if item["etapa_atual"] != "revisao_codigo":
        raise kb.InvalidTransition("Só cards em Revisão de código são aprovados.")
    if item["job"] and item["job"]["status"] in ("queued", "running"):
        raise kb.InvalidTransition(kb.LOCKED)
    link = kanbagent_review.pr_link(item)
    text = "Aprovado."
    if link and link.get("estado") != "merged":
        error = kanbagent_review.merge(link["repo"], link["numero"])
        if error:
            raise kb.InvalidTransition(f"O merge do PR falhou: {error}")
        kb.set_link_state(link["id"], "merged")
        text = f"Aprovado: merge do PR {link['url']}."
    kb.change_stage(card_id, "entregue", "sato", text=text)


@bp.post("/card/<int:card_id>/aprovar")
def approve_form(card_id):
    try:
        approve(card_id)
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


@bp.post("/card/<int:card_id>/repropor")
def repropose_form(card_id):
    try:
        _kick(kb.request_agent(card_id))
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


def _kick(job_id):
    """Pedido novo na fila: dispara o worker do tipo dele (o crontab cobre se o disparo falhar)."""
    if job_id and os.getenv("KANBAGENT_HERMES_WORKER", "1") != "0":
        kind = kb.job(job_id)["kind"]
        {"execucao": kanbagent_exec, "revisao_codigo": kanbagent_review}.get(kind, kanbagent_hermes).spawn()


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


@bp.post("/card/<int:card_id>/repo")
def repo_form(card_id):
    try:
        repo, novo, publico = _repo_fields()
        kb.set_repo(card_id, "sato", repo=repo, novo_repo=novo, publico=publico)
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


@bp.post("/card/<int:card_id>/referencia")
def ref_link_form(card_id):
    try:
        kb.add_ref_link(card_id, _text("url", True, 1000), "sato", _text("titulo", limit=200))
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


@bp.post("/card/<int:card_id>/presenca")
def card_presence(card_id):
    """A página do card avisa a cada 15 s enquanto está visível e com interação recente."""
    try:
        kb.add_attention(card_id)
    except kb.NotFound:
        abort(404)
    return "", 204


@bp.post("/card/<int:card_id>/anexo")
def ref_file_form(card_id):
    upload = request.files.get("arquivo")
    try:
        if upload is None or not upload.filename:
            raise ValueError("Escolha um arquivo.")
        kb.add_ref_file(card_id, "sato", upload.filename, upload.read(kb.MAX_FILE + 1))
    except (ValueError, kb.NotFound) as error:
        return _back(card_id, error)
    return _back(card_id)


@bp.get("/card/<int:card_id>/anexo/<int:ref_id>")
def ref_file(card_id, ref_id):
    try:
        item = kb.ref(card_id, ref_id)
    except kb.NotFound:
        abort(404)
    if item["tipo"] != "arquivo":
        abort(404)
    # Sempre como download: um HTML anexado nunca roda no domínio do site.
    return send_file(item["path"], as_attachment=True, download_name=item["titulo"],
                     mimetype="application/octet-stream")


# Artefato da execução: imagem abre direto; texto, SVG, HTML e PDF abrem isolados (CSP sandbox: origem
# opaca, sem cookies nem acesso ao site); o resto baixa.
IMAGES = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg", b"GIF87a": "image/gif",
          b"GIF89a": "image/gif"}
ISOLATED = {".svg": "image/svg+xml", ".html": "text/html", ".htm": "text/html", ".pdf": "application/pdf",
            ".txt": "text/plain", ".md": "text/plain", ".json": "application/json", ".csv": "text/plain"}


def artifact_kind(path):
    """(mimetype, isolado) do artefato; None = só download."""
    with open(path, "rb") as handle:
        head = handle.read(16)
    for magic, mimetype in IMAGES.items():
        if head.startswith(magic):
            return mimetype, False
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp", False
    suffix = os.path.splitext(path)[1].lower()
    return (ISOLATED[suffix], True) if suffix in ISOLATED else None


@bp.get("/card/<int:card_id>/artefato/<int:artifact_id>")
def artifact_file(card_id, artifact_id):
    try:
        item = kb.artifact(card_id, artifact_id)
    except kb.NotFound:
        abort(404)
    kind = None if request.args.get("baixar") else artifact_kind(item["path"])
    if kind is None:
        return send_file(item["path"], as_attachment=True, download_name=item["nome"],
                         mimetype="application/octet-stream")
    mimetype, isolated = kind
    if mimetype.startswith("text/") or mimetype == "application/json":
        mimetype += "; charset=utf-8"
    response = send_file(item["path"], mimetype=mimetype, download_name=item["nome"])
    response.headers["Content-Security-Policy"] = (
        "sandbox allow-scripts; default-src 'none'; img-src data: blob:; style-src 'unsafe-inline';"
        " script-src 'unsafe-inline'" if isolated else "default-src 'none'; style-src 'unsafe-inline'")
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


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
        card_id = kb.create_card(str(data.get("titulo", "")).strip()[:200], str(data.get("ideia", "")).strip(),
                                 _author(), project_id=project_id, repo=data.get("repo") or None,
                                 novo_repo=data.get("novo_repo") or None, publico=bool(data.get("publico")))
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


@bp.get("/api/jobs")
def api_jobs():
    """Último pedido ao Hermes de cada card pedido (`?cards=1,2`): o quadro acompanha ao vivo."""
    ids = [int(x) for x in request.args.get("cards", "").split(",") if x.strip().isdigit()][:100]
    return jsonify({str(card_id): job for card_id, job in kb.latest_jobs(ids).items()})


@bp.post("/api/cards/<int:card_id>/aprovar")
def api_approve(card_id):
    try:
        approve(card_id)
    except Exception as error:
        return _api_error(error)
    return jsonify(kb.card(card_id))


@bp.post("/api/cards/<int:card_id>/repropor")
def api_repropose(card_id):
    try:
        _kick(kb.request_agent(card_id))
    except Exception as error:
        return _api_error(error)
    return jsonify(kb.card(card_id))


@bp.post("/api/cards/<int:card_id>/stage")
def api_stage(card_id):
    data = request.get_json(silent=True) or {}
    try:
        _kick(kb.change_stage(card_id, str(data.get("para", "")), _author(), text=data.get("texto")))
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
