"""Fitness functions: docs/architecture.md principles enforced as tests.

A failure here means a change breaks an architectural decision. Fix the code,
or add an ADR superseding the decision and update this test in the same PR.
"""
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOMAIN = sorted((ROOT / "hermes_dashboard").glob("*.py"))
PYTHON = DOMAIN + [ROOT / "app.py"] + sorted((ROOT / "tools").glob("*.py"))

# Calls that block on something outside the process. subprocess.Popen is
# excluded: long-lived processes are supervised by their owner (warm_runner).
BLOCKING = {
    ("subprocess", "run"), ("subprocess", "check_output"), ("subprocess", "check_call"),
    ("subprocess", "call"), ("request", "urlopen"), ("urllib.request", "urlopen"),
    ("requests", "get"), ("requests", "post"), ("requests", "put"),
    ("requests", "delete"), ("requests", "request"),
}


def tree(path):
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def dotted(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = dotted(node.value)
        return f"{base}.{node.attr}" if base else None
    return None


def imported_names(module):
    """Bare names bound by `from X import name`, mapped to (X, name)."""
    names = {}
    for node in ast.walk(module):
        if isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                names[alias.asname or alias.name] = (node.module, alias.name)
    return names


def call_target(call, names):
    target = dotted(call.func)
    if not target:
        return None
    if "." in target:
        module, _, attr = target.rpartition(".")
        return module, attr
    return names.get(target)


def where(path, node):
    return f"{path.relative_to(ROOT)}:{node.lineno}"


def test_blocking_external_calls_have_a_timeout():
    """ADR 0001/checklist: every subprocess or network call declares a timeout."""
    missing = []
    for path in PYTHON:
        module = tree(path)
        names = imported_names(module)
        for node in ast.walk(module):
            if not isinstance(node, ast.Call):
                continue
            target = call_target(node, names)
            if target in BLOCKING and not any(k.arg == "timeout" for k in node.keywords):
                missing.append(f"{where(path, node)} {'.'.join(target)}")
    assert not missing, "Add timeout= to: " + ", ".join(missing)


def test_domain_modules_do_not_import_the_flask_app():
    """ADR 0001: hermes_dashboard modules never depend on app.py."""
    offenders = []
    for path in DOMAIN:
        for node in ast.walk(tree(path)):
            if isinstance(node, ast.Import) and any(a.name == "app" for a in node.names):
                offenders.append(where(path, node))
            if isinstance(node, ast.ImportFrom) and node.module == "app":
                offenders.append(where(path, node))
    assert not offenders, "Domain modules import app.py: " + ", ".join(offenders)


def test_hermes_sqlite_sources_are_opened_read_only():
    """ADR 0008: Hermes sources are read-only; only modules that own a database
    may open it for writing: the chat queue (web_chat.py) and the kanbagent
    (kanbagent.py, ADR 0009)."""
    own_databases = {"web_chat.py", "kanbagent.py"}
    offenders = []
    for path in DOMAIN:
        if path.name in own_databases:
            continue
        for node in ast.walk(tree(path)):
            if isinstance(node, ast.Call) and dotted(node.func) == "sqlite3.connect":
                source = ast.get_source_segment(path.read_text(encoding="utf-8"), node.args[0]) if node.args else ""
                if "mode=ro" not in (source or ""):
                    offenders.append(where(path, node))
    assert not offenders, "Open Hermes databases with ?mode=ro: " + ", ".join(offenders)


def test_front_end_loads_nothing_from_a_cdn():
    """ADR 0006: scripts, styles and modules are served from static/."""
    external = re.compile(
        r"""<script[^>]+src=["']https?:|<link[^>]+href=["']https?:[^>]*stylesheet|"""
        r"""<link[^>]+stylesheet[^>]*href=["']https?:|\bfrom\s+["']https?:|\bimport\s*\(\s*["']https?:""")
    offenders = []
    for path in sorted((ROOT / "templates").rglob("*.html")) + sorted((ROOT / "static/js").glob("*.js")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if external.search(line):
                offenders.append(f"{path.relative_to(ROOT)}:{number}")
    assert not offenders, "Vendor these assets under static/vendor/: " + ", ".join(offenders)


def test_every_adr_is_indexed():
    """docs/adr/README.md lists every ADR file, so decisions stay discoverable."""
    adr = ROOT / "docs/adr"
    index = (adr / "README.md").read_text(encoding="utf-8")
    missing = [p.name for p in sorted(adr.glob("[0-9][0-9][0-9][0-9]-*.md")) if p.name not in index]
    assert not missing, "Add to docs/adr/README.md: " + ", ".join(missing)
