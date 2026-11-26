"""Imagem de perfil de quem aparece no histórico dos cards (sato, hermes, claude, github-sync).

Cada autor tem um padrão em `static/avatars/`. O Sato pode trocar por uma foto (PNG, JPEG ou WebP, até
2 MB) na página Ajustes; o arquivo fica ao lado do banco, em `kanbagent-avatars/<autor>.<ext>`. SVG não
é aceito no upload: pode carregar script.
"""
from pathlib import Path

from . import kanbagent as kb

MAX_SIZE = 2 * 1024 * 1024
STATIC = Path(__file__).resolve().parent.parent / "static"
DEFAULTS = {"sato": "avatars/sato.svg", "hermes": "avatars/hermes.png",
            "claude": "avatars/claude.svg", "github-sync": "avatars/github-sync.svg"}
NAMES = {"sato": "Sato", "hermes": "Hermes", "claude": "Claude", "github-sync": "GitHub (sync)"}
TYPES = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "svg": "image/svg+xml"}


def _dir():
    return kb.DB_PATH.parent / "kanbagent-avatars"   # ao lado do banco (os testes trocam o DB_PATH)


def _check(author):
    if author not in DEFAULTS:
        raise kb.NotFound(f"autor desconhecido: {author}")


def sniff(data):
    """Extensão pelo conteúdo, não pelo nome do arquivo."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def custom(author):
    _check(author)
    for ext in ("png", "jpg", "webp"):
        path = _dir() / f"{author}.{ext}"
        if path.is_file():
            return path
    return None


def path(author):
    """(arquivo, mimetype) da imagem atual: a enviada ou a padrão."""
    found = custom(author)
    if found is None:
        found = STATIC / DEFAULTS[author]
    return found, TYPES[found.suffix[1:]]


def version(author):
    """Muda quando a imagem muda, para a URL furar o cache."""
    found = custom(author)
    return int(found.stat().st_mtime) if found else 0


def save(author, data):
    _check(author)
    if not data:
        raise ValueError("Escolha uma imagem.")
    if len(data) > MAX_SIZE:
        raise ValueError("A imagem passa de 2 MB.")
    ext = sniff(data)
    if ext is None:
        raise ValueError("Use PNG, JPEG ou WebP.")
    folder = _dir()
    folder.mkdir(parents=True, exist_ok=True)
    reset(author)
    (folder / f"{author}.{ext}").write_bytes(data)


def reset(author):
    """Volta para a imagem padrão."""
    while (found := custom(author)) is not None:
        found.unlink()
