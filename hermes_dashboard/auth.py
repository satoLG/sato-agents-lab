"""Login único do site (ADR 0010): a senha do chat privado protege tudo menos a home.

A sessão é a mesma do chat: cookie Flask assinado, chaves `web_chat_*`, CSRF no
header `X-Chat-CSRF`. Sem hash ou segredo configurado, o login fica indisponível
e as áreas protegidas fecham (503), nunca abrem.
"""
import logging
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta
from urllib.parse import urlsplit

from flask import jsonify, request, session
from werkzeug.security import check_password_hash

LOG = logging.getLogger(__name__)
PASSWORD_HASH = os.getenv("HERMES_WEB_CHAT_PASSWORD_HASH", "")
SESSION_SECRET = os.getenv("HERMES_WEB_CHAT_SESSION_SECRET", "")
MAX_LOGIN_ATTEMPTS = 12
LOGIN_WINDOW_SECONDS = 900
LOGIN_ATTEMPTS = defaultdict(deque)
LOGIN_LOCK = threading.Lock()
CSRF_HEADER = "X-Chat-CSRF"


def enabled():
    return bool(PASSWORD_HASH and SESSION_SECRET)


def configure(app):
    if not enabled():
        return
    app.secret_key = SESSION_SECRET
    app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Strict",
                      SESSION_COOKIE_SECURE=True, PERMANENT_SESSION_LIFETIME=timedelta(days=7))


def origin_ok():
    origin = request.headers.get("Origin")
    return not origin or urlsplit(origin).netloc == request.host


def authorized():
    return enabled() and session.get("web_chat_authenticated") is True


def csrf_token():
    return session.get("web_chat_csrf") if authorized() else None


def csrf_ok():
    """Origem do próprio site e token da sessão (header ou campo `csrf` de formulário)."""
    expected = csrf_token()
    sent = request.headers.get(CSRF_HEADER) or request.form.get("csrf")
    return bool(expected) and origin_ok() and isinstance(sent, str) and secrets.compare_digest(sent, expected)


def session_status():
    return jsonify({"available": enabled(), "authenticated": authorized(), "csrf": csrf_token()})


def login():
    if not enabled():
        return jsonify({"error": "Chat privado não configurado."}), 503
    if not origin_ok():
        return jsonify({"error": "Origem inválida."}), 403
    data = request.get_json(silent=True)
    password = data.get("password") if isinstance(data, dict) else None
    if not isinstance(password, str) or len(password) > 256:
        return jsonify({"error": "Senha inválida."}), 400
    key = request.remote_addr or "unknown"
    now = time.time()
    with LOGIN_LOCK:
        attempts = LOGIN_ATTEMPTS[key]
        while attempts and attempts[0] < now - LOGIN_WINDOW_SECONDS:
            attempts.popleft()
        if len(attempts) >= MAX_LOGIN_ATTEMPTS:
            LOG.warning("login bloqueado por excesso de tentativas de %s", key)
            return jsonify({"error": "Muitas tentativas. Aguarde 15 minutos."}), 429
        attempts.append(now)
    if not check_password_hash(PASSWORD_HASH, password):
        LOG.warning("login falhou de %s", key)
        return jsonify({"error": "Senha incorreta."}), 401
    session.clear()
    session.permanent = True
    session["web_chat_authenticated"] = True
    session["web_chat_csrf"] = secrets.token_urlsafe(24)
    return session_status()


def logout():
    """Limpa a sessão. Sem sessão é no-op; com sessão exige CSRF. Devolve None ou a recusa."""
    if not authorized():
        session.clear()
        return None
    if not csrf_ok():
        return jsonify({"error": "Sessão inválida; recarregue a página."}), 403
    session.clear()
    return None


def require(write=False, message="Entre para acessar."):
    """None se a requisição pode seguir; senão a resposta JSON de recusa."""
    if not enabled():
        return jsonify({"error": "Login não configurado."}), 503
    if not authorized():
        return jsonify({"error": message}), 401
    if write and not csrf_ok():
        return jsonify({"error": "Sessão inválida; recarregue a página."}), 403
    return None


def safe_next(value, default="/dashboard"):
    """Só caminhos relativos do próprio site; URL absoluta, `//` e `\\` viram o padrão."""
    if not isinstance(value, str) or not value.startswith("/") or len(value) > 2000:
        return default
    if value.startswith("//") or "\\" in value or any(ord(c) < 32 for c in value):
        return default
    parts = urlsplit(value)
    if parts.scheme or parts.netloc:
        return default
    return value
