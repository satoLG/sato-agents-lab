"""ADR 0010: só a home é pública; o resto exige o login do site."""
import re

import pytest

import app as app_module
from hermes_dashboard import auth

PROTECTED_API = ["/api/memory", "/api/rag/list", "/api/cronjobs", "/fragments/live"]


def test_without_session_dashboard_redirects_to_login(anonymous):
    response = anonymous.get("/dashboard")
    assert response.status_code == 302
    assert response.headers["Location"] == "/login?next=/dashboard"


@pytest.mark.parametrize("path", PROTECTED_API)
def test_without_session_protected_api_is_401_json(anonymous, path):
    response = anonymous.get(path)
    assert response.status_code == 401
    assert response.get_json() == {"error": "Entre para acessar."}
    assert "no-store" in response.headers["Cache-Control"]


@pytest.mark.parametrize("path", ["/", "/api/sato-agent/suggestions", "/api/lab/hermes-chat/session", "/login"])
def test_public_routes_need_no_session(anonymous, path):
    assert anonymous.get(path).status_code not in (401, 302, 503)


def test_unknown_paths_stay_404_without_session(anonymous):
    for path in ("/lab", "/orb", "/models", "/api/nao-existe"):
        assert anonymous.get(path).status_code == 404


def test_with_session_dashboard_is_200(client):
    response = client.get("/dashboard")
    assert response.status_code == 200
    assert "no-store" in response.headers["Cache-Control"]
    assert 'action="/logout"' in response.get_data(as_text=True)


def _sample_url(rule):
    values = {}
    for name in rule.arguments:
        converter = rule._converters[name]
        values[name] = "2026-01-01" if name == "date" else ("x/y.js" if "path" in type(converter).__name__.lower() else "x")
    url = rule.rule
    for name, value in values.items():
        url = re.sub(r"<(?:[^:<>]+:)?" + name + ">", value, url)
    return url


def test_every_route_outside_the_public_list_requires_a_session(anonymous):
    """Rota nova nasce protegida: só a lista explícita do ADR 0010 escapa."""
    checked, leaks = 0, []
    for rule in app_module.app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue
        url = _sample_url(rule)
        if app_module.is_public(url):
            continue
        method = "GET" if "GET" in rule.methods else sorted(rule.methods - {"HEAD", "OPTIONS"})[0]
        response = anonymous.open(url, method=method)
        checked += 1
        if response.status_code not in (401, 302):
            leaks.append(f"{method} {url} -> {response.status_code}")
    assert checked > 20
    assert not leaks, "rotas abertas sem sessão: " + ", ".join(leaks)


def test_public_list_is_explicit():
    assert app_module.PUBLIC_PATHS == {"/", "/login", "/logout", "/api/lab/chat"}
    assert app_module.PUBLIC_PREFIXES == ("/assets/", "/static/", "/api/lab/hermes-chat/", "/api/sato-agent/")
    assert not app_module.is_public("/dashboard")
    assert not app_module.is_public("/api/lab/hermes-chatx")
    assert not app_module.is_public("/kanbagent")


def test_unconfigured_login_closes_protected_routes(vm, anonymous, monkeypatch):
    monkeypatch.setattr(auth, "PASSWORD_HASH", "")
    assert anonymous.get("/dashboard").status_code == 503
    assert anonymous.get("/login").status_code == 503
    for path in PROTECTED_API:
        assert anonymous.get(path).status_code == 503
    assert anonymous.get("/").status_code == 200


def test_unconfigured_secret_also_closes(vm, anonymous, monkeypatch):
    monkeypatch.setattr(auth, "SESSION_SECRET", "")
    assert anonymous.get("/api/memory").status_code == 503


@pytest.mark.parametrize("target", ["https://evil.com", "//evil.com", "/\\evil.com", "http:/evil.com", "javascript:alert(1)"])
def test_next_only_accepts_relative_paths(anonymous, target):
    page = anonymous.get("/login", query_string={"next": target}).get_data(as_text=True)
    assert 'data-next="/dashboard"' in page
    assert "evil.com" not in page


def test_login_redirects_back_to_next_when_already_authenticated(client):
    response = client.get("/login?next=/dashboard%3Ftab%3Dcron")
    assert response.status_code == 302 and response.headers["Location"] == "/dashboard?tab=cron"
    evil = client.get("/login?next=//evil.com")
    assert evil.headers["Location"] == "/dashboard"


def test_protected_post_requires_csrf(client):
    assert client.post("/api/memory").status_code == 403
    assert client.post("/api/memory", headers={"X-Chat-CSRF": "errado"}).status_code == 403
    cross = client.post("/api/memory", headers={"X-Chat-CSRF": client.csrf, "Origin": "https://evil.test"})
    assert cross.status_code == 403
    assert client.post("/api/memory", headers={"X-Chat-CSRF": client.csrf}).status_code == 405


def test_logout_requires_csrf_clears_session_and_repeats_as_noop(client):
    assert client.post("/logout").status_code == 403
    assert client.get("/dashboard").status_code == 200
    response = client.post("/logout", data={"csrf": client.csrf})
    assert response.status_code == 303 and response.headers["Location"] == "/"
    assert client.get("/dashboard").status_code == 302
    assert client.post("/logout").status_code == 303


def test_repeated_login_renews_the_session(client, site_login):
    again = client.post("/api/lab/hermes-chat/login", json={"password": site_login})
    assert again.status_code == 200 and again.get_json()["csrf"] != client.csrf
    assert client.get("/dashboard").status_code == 200


def test_failed_login_is_logged_without_the_password(anonymous, caplog):
    caplog.set_level("WARNING", logger="hermes_dashboard.auth")
    response = anonymous.post("/api/lab/hermes-chat/login", json={"password": "senha-secreta-errada"})
    assert response.status_code == 401
    assert "login falhou" in caplog.text
    assert "senha-secreta-errada" not in caplog.text


def test_login_rate_limit_is_kept(anonymous):
    for _ in range(auth.MAX_LOGIN_ATTEMPTS):
        assert anonymous.post("/api/lab/hermes-chat/login", json={"password": "x"}).status_code == 401
    assert anonymous.post("/api/lab/hermes-chat/login", json={"password": "x"}).status_code == 429
    assert auth.MAX_LOGIN_ATTEMPTS == 12 and auth.LOGIN_WINDOW_SECONDS == 900


def test_session_check_failure_closes_without_generic_500(anonymous, monkeypatch):
    def boom():
        raise RuntimeError("falha inesperada")
    monkeypatch.setattr(auth, "authorized", boom)
    response = anonymous.get("/api/memory")
    assert response.status_code == 503
    assert response.get_json() == {"error": "Login indisponível. Tente novamente."}


def test_session_cookie_flags_follow_configure(monkeypatch):
    from flask import Flask
    monkeypatch.setattr(auth, "PASSWORD_HASH", "hash")
    monkeypatch.setattr(auth, "SESSION_SECRET", "segredo")
    probe = Flask("probe")
    auth.configure(probe)
    assert probe.config["SESSION_COOKIE_HTTPONLY"] is True
    assert probe.config["SESSION_COOKIE_SECURE"] is True
    assert probe.config["SESSION_COOKIE_SAMESITE"] == "Strict"
