"""Repositórios do GitHub do Sato para escolher no card (lista com cache curto).

Usa o mesmo token do worker de issues/executor (`kanbagent_exec._github_token`). Sem token ou com o
GitHub fora do ar, devolve o último resultado bom (ou lista vazia): a página nunca quebra por isso.
`KANBAGENT_GITHUB=0` desliga as chamadas (testes, desenvolvimento).
"""
import json
import logging
import os
import subprocess
import threading
import time

LOG = logging.getLogger(__name__)
CACHE_SECONDS = 10 * 60
_cache = {"at": 0.0, "repos": [], "login": None}
_lock = threading.Lock()


def _gh(*args):
    from .kanbagent_exec import _github_token
    result = subprocess.run(["gh", "api", *args], capture_output=True, text=True, timeout=30,
                            env={**os.environ, "GH_TOKEN": _github_token()})
    if result.returncode:
        raise RuntimeError(result.stderr.strip()[-200:])
    return result.stdout


def _refresh():
    login = _gh("user", "--jq", ".login").strip()
    lines = _gh("--paginate", "user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
                "--jq", ".[] | {full_name, private, archived}")
    repos = [json.loads(line) for line in lines.splitlines() if line.strip()]
    return login, [{"full_name": r["full_name"], "private": r["private"]} for r in repos if not r.get("archived")]


def repos(force=False):
    """`(login, [{full_name, private}])`, mais recentes primeiro."""
    if os.getenv("KANBAGENT_GITHUB", "1") == "0":
        return _cache["login"], list(_cache["repos"])
    with _lock:
        if force or time.monotonic() - _cache["at"] > CACHE_SECONDS:
            try:
                _cache["login"], _cache["repos"] = _refresh()
                _cache["at"] = time.monotonic()
            except Exception as error:   # sem token, sem rede, gh ausente: segue com o cache
                LOG.warning("kanbagent: não deu para listar os repositórios do GitHub: %s", error)
                _cache["at"] = time.monotonic() - CACHE_SECONDS + 60   # tenta de novo em 1 min
        return _cache["login"], list(_cache["repos"])
