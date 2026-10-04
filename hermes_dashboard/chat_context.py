"""Bounded, read-only VM context prepared by the server, never model tool calls."""
import json
import re
from collections import Counter

from . import memory, rag, vm
from .commit_context import _words, _commit_context

TOKEN = re.compile(r"\b(?:sk-[\w-]{16,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,})\b")
SECRET_KEY = re.compile(r"(?:api.?key|token|secret|password|passwd|credential|authorization)", re.I)


def scrub(value, depth=0):
    if depth > 7:
        return None
    if isinstance(value, dict):
        return {str(key)[:100]: scrub(item, depth + 1) for key, item in list(value.items())[:80]
                if not SECRET_KEY.search(str(key))}
    if isinstance(value, list):
        return [scrub(item, depth + 1) for item in value[:64]]
    if isinstance(value, str):
        text = memory.redact_secrets(value)
        text = re.sub(r"(?im)^(\s*[\w.-]*(?:key|token|secret|password|credential)[\w.-]*\s*=).+$", r"\1[REDIGIDO]", text)
        return TOKEN.sub("[REDIGIDO]", text)[:4000]
    return value


def _read(producer):
    try:
        return producer()
    except Exception:
        return {"error": "Fonte indisponível"}


def collect(snapshot, question):
    context = {"sectors": snapshot.get("sectors", []), "workers": snapshot.get("workers", []),
               "events": snapshot.get("events", [])[:24], "warnings": snapshot.get("warnings", []),
               "visuals": snapshot.get("visuals", {}), "telemetry_available": snapshot.get("telemetry_available"),
               "vm": _read(lambda: vm.snapshot(with_breakdown=False))}
    catalog = _read(memory.catalog)
    entries = catalog.get("documents", []) + catalog.get("skills", [])
    context["document_catalog"] = [{key: entry.get(key) for key in ("name", "category", "modified")}
                                   for entry in entries[:96]]
    words = _words(question)
    # Only catalog paths are read. Prompt text can never become a filesystem path.
    candidates = sorted(entries, key=lambda e: (-len(words & _words(e.get("name", ""))),
                                               e.get("category") not in ("memoria", "contexto"), e.get("name", "")))[:16]
    documents = []
    for entry in candidates:
        try:
            document = memory.read_document(entry["path"])
        except (OSError, ValueError):
            continue
        content = str(document.get("content", ""))
        lines = content.splitlines()
        matches = [i for i, line in enumerate(lines) if words & _words(line)]
        indexes = sorted({i for hit in matches[:10] for i in range(max(0, hit - 1), min(len(lines), hit + 3))})
        excerpt = "\n".join(lines[i] for i in indexes) if indexes else content[:2500]
        score = 4 * len(words & _words(entry.get("name", ""))) + len(words & _words(content[:40000]))
        documents.append((score, {"name": entry.get("name"), "category": entry.get("category"),
                                  "content": excerpt[:4000], "excerpt": True}))
    context["documents"] = [item for _, item in sorted(documents, key=lambda pair: -pair[0])[:6]]
    vector = _read(lambda: rag.catalog(preview=2000))
    all_docs = vector.get("docs", [])
    summary, commit_docs = _commit_context(all_docs, question)
    summary["counts_are_exact_for_indexed_data"] = not bool(vector.get("error"))
    commit_question = bool(words & {"commit", "commits"})
    docs = sorted(commit_docs if commit_question else all_docs,
                  key=lambda d: (len(words & _words(f"{d.get('title', '')} {d.get('preview', '')}")),
                                 str(d.get("updated", ""))), reverse=True)
    context["rag"] = {"total": vector.get("total"), "error": vector.get("error"),
                      "by_type": dict(Counter(d.get("type") or "doc" for d in all_docs)),
                      "sync": vector.get("sync", {"last_full_coverage_confirmed": False}),
                      "commit_summary": summary, "documents_are_partial": True,
                      "documents": [{key: item.get(key) for key in ("title", "repo", "type", "preview", "url", "updated")}
                                    for item in docs[:8]]}
    context["limits"] = "Telemetria e trechos selecionados do catálogo da VM; não é uma leitura completa de todos os arquivos ou fontes externas."
    cleaned = scrub(context)
    # Retain the VM readings and document excerpts when a busy host has many runs.
    if len(json.dumps(cleaned, ensure_ascii=False)) > 80000:
        cleaned["workers"] = [w for w in cleaned["workers"] if str(w.get("id", "")).startswith("guide:")] + cleaned["workers"][:8]
        cleaned["events"] = cleaned["events"][:8]
        cleaned["limits"] += " A lista de execuções recentes foi reduzida para caber no contexto."
    return cleaned
