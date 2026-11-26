"""Tela e API do kanbagent (ADR 0009/0010): login do site nas páginas, token Bearer na API."""
import re

import pytest

from hermes_dashboard import kanbagent as kb
from hermes_dashboard import kanbagent_sync

TOKEN = "token-de-teste-do-kanbagent"


@pytest.fixture
def api(vm, site_login, monkeypatch):
    """Cliente sem sessão que fala com a API usando o token do Sato Agent."""
    import app as app_module
    monkeypatch.setenv("KANBAGENT_API_TOKEN", TOKEN)
    client = app_module.app.test_client()
    client.headers = {"Authorization": f"Bearer {TOKEN}"}
    return client


def form(client, target, /, **data):
    return client.post(target, data={"csrf": client.csrf, **data})


# --- acesso ---------------------------------------------------------------------------------------

@pytest.mark.parametrize("path", ["/kanbagent", "/kanbagent/metricas", "/kanbagent/projetos"])
def test_pages_require_site_login(anonymous, path):
    response = anonymous.get(path)
    assert response.status_code == 302
    assert response.headers["Location"].startswith("/login?next=/kanbagent")


def test_api_without_session_or_token_is_401(anonymous):
    assert anonymous.get("/kanbagent/api/cards").status_code == 401


def test_api_with_wrong_token_is_401(api):
    response = api.get("/kanbagent/api/cards", headers={"Authorization": "Bearer errado"})
    assert response.status_code == 401


def test_api_token_unset_keeps_api_closed(anonymous, monkeypatch):
    monkeypatch.delenv("KANBAGENT_API_TOKEN", raising=False)
    response = anonymous.get("/kanbagent/api/cards", headers={"Authorization": "Bearer qualquer"})
    assert response.status_code == 503


def test_bearer_does_not_open_pages(api):
    response = api.get("/kanbagent", headers=api.headers)
    assert response.status_code == 302


def test_form_post_without_csrf_is_refused(client):
    response = client.post("/kanbagent/cards", data={"titulo": "x", "ideia": "y"})
    assert response.status_code == 403
    assert kb.cards() == []


# --- páginas --------------------------------------------------------------------------------------

def test_empty_board_renders(client):
    response = client.get("/kanbagent")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "lucide.svg#plus" in html and "Anotar" in html and "kanbagent.css" in html


def test_full_flow_through_the_pages(client):
    response = form(client, "/kanbagent/projetos", nome="Sato Agents", slug="sato-agents",
                    repos="satoLG/sato-agents-lab, satoLG/outro")
    assert response.status_code == 303
    project = kb.project_by_slug("sato-agents")
    assert sorted(r["full_name"] for r in kb.projects()[0]["repos"]) == ["satoLG/outro", "satoLG/sato-agents-lab"]

    response = form(client, "/kanbagent/cards", titulo="Métricas do RAG", ideia="quero ver o RAG",
                    projeto=str(project))
    assert response.status_code == 303
    card_id = int(re.search(r"/card/(\d+)", response.headers["Location"]).group(1))

    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "quero ver o RAG" in page and "Pedir proposta ao Hermes" in page
    assert "→ Proposta" not in page

    form(client, f"/kanbagent/card/{card_id}/etapa", para="proposta")
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "Hermes está escrevendo" in page
    kb.update_proposal(card_id, "Fazer X e Y", "hermes")
    kb.change_stage(card_id, "revisao", "hermes")
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "Aprovar" in page and "Pedir ajuste" in page

    form(client, f"/kanbagent/card/{card_id}/etapa", para="proposta", texto="menos escopo")
    kb.change_stage(card_id, "revisao", "hermes")
    form(client, f"/kanbagent/card/{card_id}/etapa", para="aprovado")
    form(client, f"/kanbagent/card/{card_id}/comentario", texto="bora")
    kb.add_link(card_id, "https://github.com/satoLG/sato-agents-lab/issues/42", "hermes")   # links vêm do fluxo

    item = kb.card(card_id)
    assert item["etapa_atual"] == "aprovado"
    assert item["ajustes"] == 1
    assert item["proposta"] == "Fazer X e Y"
    assert [l["numero"] for l in item["links"]] == [42]

    for path in ("/kanbagent", f"/kanbagent?projeto={project}", "/kanbagent?descartados=1",
                 "/kanbagent/metricas?dias=7", "/kanbagent/projetos", f"/kanbagent/card/{card_id}"):
        assert client.get(path).status_code == 200, path


def test_adjust_requires_text(client):
    card_id = kb.create_card("T", "i", "sato")
    kb.change_stage(card_id, "proposta", "hermes")
    kb.update_proposal(card_id, "p", "hermes")
    kb.change_stage(card_id, "revisao", "hermes")
    form(client, f"/kanbagent/card/{card_id}/etapa", para="proposta")
    assert kb.card(card_id)["etapa_atual"] == "revisao"


def test_board_marks_where_each_card_can_be_dropped(client):
    idea = kb.create_card("Ideia solta", "i", "sato")
    empty = kb.create_card("Sem proposta", "i", "sato")
    kb.change_stage(empty, "proposta", "hermes")
    writing = kb.create_card("Hermes escrevendo", "i", "sato")
    kb.change_stage(writing, "proposta", "sato")
    kb.job_progress(kb.claim_job()["id"], "lendo o card")
    page = client.get("/kanbagent").get_data(as_text=True)
    assert f'data-card="{idea}" data-stage="ideia" data-next="proposta descartado"' in page
    # proposta vazia ainda não pode ir para revisão
    assert f'data-card="{empty}" data-stage="proposta" data-next="ideia descartado"' in page
    # enquanto o Hermes escreve, o card não vai para lugar nenhum e mostra o progresso
    assert f'data-card="{writing}" data-stage="proposta" data-next="" data-watch-job="{writing}"' in page
    assert "propondo…" in page and "lendo o card" in page
    assert 'data-drop="aprovado"' in page and "Fila de execução" in page
    assert 'data-drop="descartado"' in page and 'id="kb-move"' in page


def test_failed_job_offers_retry_and_jobs_api_reports_progress(client):
    card_id = kb.create_card("T", "i", "sato")
    form(client, f"/kanbagent/card/{card_id}/etapa", para="proposta")
    job = kb.claim_job()
    jobs = client.get(f"/kanbagent/api/jobs?cards={card_id}").get_json()
    assert jobs[str(card_id)]["status"] == "running"
    kb.finish_job(job["id"], error="Hermes saiu com código 1.")
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "não conseguiu" in page and "código 1" in page and "Pedir de novo" in page
    form(client, f"/kanbagent/card/{card_id}/repropor")
    assert kb.card(card_id)["job"]["status"] == "queued"


def test_returns_from_the_card_page(client):
    card_id = kb.create_card("T", "i", "sato")
    kb.change_stage(card_id, "proposta", "hermes")
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "Voltar para ideia" in page and "Enviar para revisão" not in page
    form(client, f"/kanbagent/card/{card_id}/etapa", para="ideia", texto="faltou contexto")
    item = kb.card(card_id)
    assert item["etapa_atual"] == "ideia" and item["ajustes"] == 1


def test_dashboard_and_kanbagent_share_the_side_menu(client):
    dashboard = client.get("/dashboard").get_data(as_text=True)
    assert 'class="app-side"' in dashboard and 'role="tablist"' in dashboard
    assert 'href="/kanbagent"' in dashboard
    board = client.get("/kanbagent").get_data(as_text=True)
    assert 'class="app-side"' in board and 'href="/dashboard"' in board and "app-menu" in board


def test_login_page_has_no_side_menu(anonymous):
    assert "app-side" not in anonymous.get("/login").get_data(as_text=True)


def test_invalid_transition_flashes_and_keeps_stage(client):
    card_id = kb.create_card("T", "i", "sato")
    response = form(client, f"/kanbagent/card/{card_id}/etapa", para="entregue")
    assert response.status_code == 303
    assert kb.card(card_id)["etapa_atual"] == "ideia"
    assert "Transição inválida" in client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)


def test_missing_card_is_404(client):
    assert client.get("/kanbagent/card/999").status_code == 404


def test_html_is_escaped(client):
    card_id = kb.create_card("<script>x</script>", "<b>oi</b>", "sato")
    html = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "<script>x</script>" not in html and "&lt;script&gt;" in html


def test_only_comments_get_the_ver_mais_preview(client):
    card_id = kb.create_card("Prévia", "ideia", "sato")
    form(client, f"/kanbagent/card/{card_id}/etapa", para="proposta", texto="motivo da etapa")
    form(client, f"/kanbagent/card/{card_id}/comentario", texto="comentário longo")
    html = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert '<div class="kb-pre kb-box" data-rich data-clamp>comentário longo</div>' in html
    assert '<div class="kb-pre kb-box" data-rich>motivo da etapa</div>' in html


# --- API do Sato Agent ----------------------------------------------------------------------------

def test_api_flow_with_token(api):
    h = api.headers
    assert api.post("/kanbagent/api/projects", json={"slug": "lab", "nome": "Lab",
                                                     "repos": ["satoLG/sato-agents-lab"]}, headers=h).status_code == 201
    response = api.post("/kanbagent/api/cards", json={"titulo": "Ideia", "ideia": "texto cru",
                                                      "projeto": "lab"}, headers=h)
    assert response.status_code == 201
    card_id = response.get_json()["id"]

    response = api.post(f"/kanbagent/api/cards/{card_id}/proposal",
                        json={"proposta": "Plano", "revisar": True}, headers=h)
    assert response.status_code == 200
    item = api.get(f"/kanbagent/api/cards/{card_id}", headers=h).get_json()
    assert item["etapa_atual"] == "revisao"
    assert item["proposta"] == "Plano"
    assert {e["author"] for e in item["events"]} == {"hermes"}

    response = api.post(f"/kanbagent/api/cards/{card_id}/stage", json={"para": "entregue"}, headers=h)
    assert response.status_code == 409

    listed = api.get("/kanbagent/api/cards?projeto=lab", headers=h).get_json()
    assert [c["id"] for c in listed["cards"]] == [card_id]
    assert api.get("/kanbagent/api/metrics?dias=7", headers=h).status_code == 200
    assert api.get("/kanbagent/api/cards/999", headers=h).status_code == 404


def test_api_with_session_needs_csrf_header(client):
    assert client.post("/kanbagent/api/cards", json={"titulo": "a", "ideia": "b"}).status_code == 403
    response = client.post("/kanbagent/api/cards", json={"titulo": "a", "ideia": "b"},
                           headers={"X-Chat-CSRF": client.csrf})
    assert response.status_code == 201
    assert kb.card(response.get_json()["id"])["events"][0]["author"] == "sato"


# --- sync com o GitHub (fetcher falso) ------------------------------------------------------------

def test_sync_moves_approved_card_to_delivered(vm):
    card_id = kb.create_card("T", "i", "sato", occurred_at="2026-01-01T00:00:00Z")
    kb.update_proposal(card_id, "p", "hermes", occurred_at="2026-01-01T12:00:00Z")
    for stage, when in (("proposta", "2026-01-02T00:00:00Z"), ("revisao", "2026-01-03T00:00:00Z"),
                        ("aprovado", "2026-01-04T00:00:00Z")):
        kb.change_stage(card_id, stage, "hermes", occurred_at=when)
    kb.add_link(card_id, "https://github.com/o/r/issues/7", "sato")

    def fake(link):
        assert (link["repo"], link["numero"], link["tipo"]) == ("o/r", 7, "issue")
        return {"state": "closed", "created": "2026-01-05T00:00:00Z", "done_at": "2026-01-08T00:00:00Z",
                "prs": [{"number": 9, "url": "https://github.com/o/r/pull/9", "state": "MERGED",
                         "createdAt": "2026-01-06T00:00:00Z", "mergedAt": "2026-01-08T00:00:00Z"}]}

    report = kanbagent_sync.sync(fetcher=fake)
    assert report["errors"] == [] and report["moved"] == 3
    item = kb.card(card_id)
    assert item["etapa_atual"] == "entregue"
    assert sorted(l["numero"] for l in item["links"]) == [7, 9]
    stages = [(e["to_stage"], e["occurred_at"][:10]) for e in item["events"] if e["kind"] == "stage_change"]
    assert stages[-3:] == [("execucao", "2026-01-05"), ("revisao_codigo", "2026-01-06"),
                           ("entregue", "2026-01-08")]
    # repetir não duplica nada
    assert kanbagent_sync.sync(fetcher=fake)["moved"] == 0


def test_sync_ignores_cards_before_approval_and_survives_errors(vm):
    early = kb.create_card("cedo", "i", "sato")
    kb.add_link(early, "https://github.com/o/r/issues/1", "sato")
    late = kb.create_card("tarde", "i", "sato")
    kb.update_proposal(late, "p", "hermes")
    for stage in ("proposta", "revisao", "aprovado"):
        kb.change_stage(late, stage, "hermes")
    kb.add_link(late, "https://github.com/o/r/pull/2", "sato")

    def broken(link):
        raise RuntimeError("gh fora do ar")

    report = kanbagent_sync.sync(fetcher=broken)
    assert report["links"] == 1 and len(report["errors"]) == 1
    assert kb.card(early)["etapa_atual"] == "ideia"
    assert kb.card(late)["etapa_atual"] == "aprovado"


def test_execution_job_shows_executing_and_kicks_the_exec_worker(client, monkeypatch):
    from hermes_dashboard import kanbagent_exec, kanbagent_hermes
    kicked = []
    monkeypatch.setenv("KANBAGENT_HERMES_WORKER", "1")
    monkeypatch.setattr(kanbagent_exec, "spawn", lambda: kicked.append("exec"))
    monkeypatch.setattr(kanbagent_hermes, "spawn", lambda: kicked.append("hermes"))
    project = kb.create_project("app", "App")
    card_id = kb.create_card("T", "i", "sato", project_id=project, repo_id=kb.add_repo_to_project(project, "sato/app"))
    kb.change_stage(card_id, "proposta", "hermes")
    kb.update_proposal(card_id, "p", "hermes")
    kb.change_stage(card_id, "revisao", "hermes")
    kb.change_stage(card_id, "aprovado", "sato")
    form(client, f"/kanbagent/card/{card_id}/etapa", para="execucao")
    assert kicked == ["exec"]
    kb.job_progress(kb.claim_job("execucao")["id"], "tarefa 1/3 · haiku · tentativa 1: botão")
    board = client.get("/kanbagent").get_data(as_text=True)
    assert "executando…" in board and "tarefa 1/3" in board
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "O Claude está executando" in page


def test_new_idea_picks_any_github_repo_or_a_new_one(client, monkeypatch):
    from hermes_dashboard import kanbagent_github
    monkeypatch.setattr(kanbagent_github, "repos", lambda force=False: (
        "satoLG", [{"full_name": "satoLG/jogo", "private": True}, {"full_name": "satoLG/site", "private": False}]))
    board = client.get("/kanbagent").get_data(as_text=True)
    assert 'value="satoLG/jogo"' in board and "privado" in board and "Novo repositório" in board
    form(client, "/kanbagent/cards", titulo="A", ideia="a", repo="satoLG/jogo")
    form(client, "/kanbagent/cards", titulo="B", ideia="b", repo="__novo__", novo_repo="jogo-2", publico="1")
    a, b = sorted(kb.cards(), key=lambda c: c["id"])
    assert kb.card(a["id"])["repo"] == "satoLG/jogo"
    assert (kb.card(b["id"])["novo_repo"], kb.card(b["id"])["novo_repo_publico"]) == ("satoLG/jogo-2", 1)
    page = client.get(f"/kanbagent/card/{a['id']}").get_data(as_text=True)
    assert "Trocar" in page and "Ligar" not in page and "issues/123" not in page
    form(client, f"/kanbagent/card/{a['id']}/repo", repo="satoLG/site")
    assert kb.card(a["id"])["repo"] == "satoLG/site"


def test_refs_links_and_files_are_added_and_downloaded_safely(client):
    card_id = kb.create_card("A", "a", "sato")
    form(client, f"/kanbagent/card/{card_id}/referencia", url="https://example.com/x", titulo="Moodboard")
    import io as _io
    client.post(f"/kanbagent/card/{card_id}/anexo", content_type="multipart/form-data",
                data={"csrf": client.csrf, "arquivo": (_io.BytesIO(b"<script>alert(1)</script>"), "x.html")})
    item = kb.card(card_id)
    assert [r["titulo"] for r in item["refs"]] == ["Moodboard", "x.html"]
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "Moodboard" in page and "Anexar" in page
    response = client.get(f"/kanbagent/card/{card_id}/anexo/{item['refs'][1]['id']}")
    assert response.status_code == 200 and response.data.startswith(b"<script>")
    assert "attachment" in response.headers["Content-Disposition"]
    assert response.headers["Content-Type"] == "application/octet-stream"
    assert client.get(f"/kanbagent/card/{card_id}/anexo/{item['refs'][0]['id']}").status_code == 404


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def test_avatars_have_defaults_and_can_be_replaced(client):
    import io as _io
    card_id = kb.create_card("A", "a", "sato")
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert 'src="/kanbagent/avatar/sato?v=0"' in page
    response = client.get("/kanbagent/avatar/claude")
    assert response.status_code == 200 and response.mimetype == "image/svg+xml"
    assert "default-src 'none'" in response.headers["Content-Security-Policy"]
    assert client.get("/kanbagent/avatar/hermes").mimetype == "image/png"
    assert client.get("/kanbagent/avatar/fulano").status_code == 404
    assert "Imagens de perfil" in client.get("/kanbagent/ajustes").get_data(as_text=True)

    client.post("/kanbagent/avatares/sato", content_type="multipart/form-data",
                data={"csrf": client.csrf, "imagem": (_io.BytesIO(PNG), "eu.svg")})
    response = client.get("/kanbagent/avatar/sato")
    assert response.data == PNG and response.mimetype == "image/png"
    response.close()   # no Windows o arquivo aberto impediria o reset
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "/kanbagent/avatar/sato?v=0" not in page and "Padrão" in client.get("/kanbagent/ajustes").get_data(as_text=True)

    client.post("/kanbagent/avatares/sato/padrao", data={"csrf": client.csrf})
    assert client.get("/kanbagent/avatar/sato").mimetype == "image/svg+xml"


def test_avatar_upload_rejects_svg_and_big_files(client):
    import io as _io
    from hermes_dashboard import kanbagent_avatars as av
    for payload in (b"<svg onload=alert(1)>", PNG + b"\x00" * av.MAX_SIZE):
        response = client.post("/kanbagent/avatares/hermes", content_type="multipart/form-data",
                               data={"csrf": client.csrf, "imagem": (_io.BytesIO(payload), "x.png")})
        assert response.status_code == 302 and av.custom("hermes") is None
    assert av.sniff(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "webp" and av.sniff(b"\xff\xd8\xff\xe0") == "jpg"
    assert client.post("/kanbagent/avatares/fulano", content_type="multipart/form-data",
                       data={"csrf": client.csrf, "imagem": (_io.BytesIO(PNG), "x.png")}).status_code == 404


def test_artifacts_open_isolated_from_the_site(client):
    card_id = kb.create_card("A", "a", "sato")
    png = kb.add_artifact(card_id, "claude", "dino.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)
    html = kb.add_artifact(card_id, "claude", "demo.html", b"<script>fetch('/api/stats')</script>")
    fake = kb.add_artifact(card_id, "claude", "fake.png", b"<svg onload=alert(1)>")
    other = kb.add_artifact(card_id, "claude", "dados.bin", b"\x00\x01")
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "Artefatos" in page and f"/artefato/{png}" in page and "entregou o artefato" in page

    response = client.get(f"/kanbagent/card/{card_id}/artefato/{png}")
    assert response.mimetype == "image/png" and "attachment" not in response.headers.get("Content-Disposition", "")
    response.close()
    response = client.get(f"/kanbagent/card/{card_id}/artefato/{html}")
    assert response.mimetype == "text/html" and "sandbox" in response.headers["Content-Security-Policy"]
    response.close()
    for artifact_id in (fake, other):      # extensão de imagem sem bytes de imagem não abre
        response = client.get(f"/kanbagent/card/{card_id}/artefato/{artifact_id}")
        assert response.mimetype == "application/octet-stream" and "attachment" in response.headers["Content-Disposition"]
        response.close()
    response = client.get(f"/kanbagent/card/{card_id}/artefato/{png}?baixar=1")
    assert "attachment" in response.headers["Content-Disposition"]
    response.close()
    assert client.get(f"/kanbagent/card/{card_id + 1}/artefato/{png}").status_code == 404


def test_queued_card_without_repo_shows_the_picker(client):
    card_id = kb.create_card("A", "a", "sato")
    kb.change_stage(card_id, "proposta", "sato")
    while (job := kb.claim_job("proposta")) is not None:
        kb.finish_job(job["id"])
    kb.update_proposal(card_id, "p", "hermes")
    kb.change_stage(card_id, "revisao", "hermes")
    kb.change_stage(card_id, "aprovado", "sato")
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "não tem repositório" in page and "Definir" in page
    form(client, f"/kanbagent/card/{card_id}/repo", repo="satoLG/biscoidino")
    assert kb.card(card_id)["repo"] == "satoLG/biscoidino"
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "não tem repositório" not in page and "Trocar o repositório" not in page


def test_empty_lists_are_collapsed_except_ideas_and_no_browser_confirm(client):
    kb.create_card("A", "a", "sato")
    page = client.get("/kanbagent").get_data(as_text=True)
    assert 'class="kb-list" aria-labelledby="col-ideia"' in page
    assert 'class="kb-list kb-list-empty" aria-labelledby="col-execucao"' in page
    empty = client.get("/kanbagent?projeto=999").get_data(as_text=True)
    assert 'class="kb-list" aria-labelledby="col-ideia"' in empty     # Ideia aberta mesmo vazia
    assert 'id="kb-confirm"' in page
    import pathlib
    root = pathlib.Path(__file__).resolve().parent.parent
    for path in [*root.joinpath("static/js").glob("*.js"), *root.joinpath("templates").rglob("*.html")]:
        text = path.read_text(encoding="utf-8")
        assert "window.confirm(" not in text and "window.alert(" not in text and " alert(" not in text, path


def test_card_page_shows_the_cost_per_model(client):
    card_id = kb.create_card("A", "a", "sato")
    assert "Custo" not in client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    kb.record_run(card_id, "plan", "sonnet", 0.2, 6, 1000)
    kb.record_run(card_id, "opus", "opus", 0.5, 9, 2000)
    page = client.get(f"/kanbagent/card/{card_id}").get_data(as_text=True)
    assert "US$ 0.70" in page and "2 chamada(s)" in page and "US$ 0.50" in page
