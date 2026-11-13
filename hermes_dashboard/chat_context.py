"""Bounded, read-only VM context prepared by the server, never model tool calls."""
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

from . import config, memory, rag, vm
from .commit_context import _words, _commit_context, repository_names
from .context_cache import SourceCache

TOKEN = re.compile(r"\b(?:sk-[\w-]{16,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,})\b")
SECRET_KEY = re.compile(r"(?:api.?key|token|secret|password|passwd|credential|authorization)", re.I)
CACHE = SourceCache()


def _stamp(path):
    try:
        stat = path.stat()
        return (str(path), stat.st_mtime_ns, stat.st_ctime_ns, stat.st_size, stat.st_ino)
    except OSError:
        return (str(path), None)


def _catalog_version():
    roots = [config.HERMES_HOME / name for name in ('memories', 'contexts', 'skills')]
    paths = [config.CONFIG_PATH, *(Path.cwd() / name for name in ('AGENTS.md', '.hermes.md', 'CLAUDE.md', 'README.md'))]
    for root in roots:
        paths.append(root)
        if root.is_dir():
            paths.extend(sorted(root.rglob('*')))
    return tuple(_stamp(path) for path in paths)


def _rag_version():
    table = config.RAG_PATH / (rag.TABLE + '.lance')
    versions = table / '_versions'
    paths = [config.RAG_PATH, table, versions, config.HERMES_HOME / 'rag_commit_state' / 'sync.json']
    if versions.is_dir():
        paths.extend(sorted(versions.iterdir()))
    return tuple(_stamp(path) for path in paths)


def _redact_text(text):
    text = memory.redact_secrets(text)
    text = re.sub(r"(?im)^(\s*[\w.-]*(?:key|token|secret|password|credential)[\w.-]*\s*=).+$", r"\1[REDIGIDO]", text)
    return TOKEN.sub('[REDIGIDO]', text)


def _document(path):
    resolved = memory._inside_roots(Path(path))
    if resolved is None:
        raise ValueError('caminho fora dos diretorios permitidos')
    def read():
        doc = memory.read_document(path)
        return {**doc, 'content': _redact_text(str(doc.get('content', '')))}
    return CACHE.get(('document', str(resolved)), _stamp(resolved), 30, read)[0]


def _rag_catalog():
    value = _read(lambda: rag.catalog(preview=2000))
    return {**value, 'docs': [scrub(doc) for doc in value.get('docs', [])]}


def scrub(value, depth=0):
    if depth > 7:
        return None
    if isinstance(value, dict):
        return {str(key)[:100]: scrub(item, depth + 1) for key, item in list(value.items())[:80]
                if not SECRET_KEY.search(str(key))}
    if isinstance(value, list):
        return [scrub(item, depth + 1) for item in value[:64]]
    if isinstance(value, str):
        return _redact_text(value)[:4000]
    return value


def _read(producer):
    try:
        return producer()
    except Exception:
        return {"error": "Fonte indisponível"}


def _collect_telemetry(snapshot, words, scope):
    context = {"sectors": snapshot.get("sectors", []), "workers": snapshot.get("workers", []),
               "events": snapshot.get("events", [])[:24], "warnings": snapshot.get("warnings", []),
               "visuals": snapshot.get("visuals", {}), "telemetry_available": snapshot.get("telemetry_available"),
               "vm": _read(lambda: vm.snapshot(with_breakdown=False))}
    catalog, catalog_freshness = CACHE.get(('catalog', scope), _catalog_version(), 30, lambda: _read(memory.catalog))
    entries = catalog.get("documents", []) + catalog.get("skills", [])
    context["document_catalog"] = [{key: entry.get(key) for key in ("name", "category", "modified")}
                                   for entry in entries[:96]]
    # Only catalog paths are read. Prompt text can never become a filesystem path.
    candidates = sorted(entries, key=lambda e: (-len(words & _words(e.get("name", ""))),
                                               e.get("category") not in ("memoria", "contexto"), e.get("name", "")))[:16]
    documents = []
    for entry in candidates:
        try:
            document = _document(entry["path"])
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
    context["freshness"] = {
        "vm": {"observed_at": context["vm"].get("timestamp"), "max_age_seconds": 0},
        "lab_catalog": {"observed_at": snapshot.get("catalog_sampled_at"), "max_age_seconds": 30},
        "document_catalog": catalog_freshness,
    }
    return context


def wants_telemetry(question):
    words = _words(question)
    return bool(words & {
        "cpu", "ram", "telemetria", "cron", "crons", "agendamento", "agendamentos",
        "processo", "processos", "gateway", "gateways", "webhook", "webhooks",
        "laboratorio", "dashboard", "mcp", "uptime", "disco", "provedor", "provedores",
        "fallback", "fallbacks", "openrouter", "opencode",
    } or re.search(r"\bvm\b", question, re.I))


def _owner_profile(question):
    plain = unicodedata.normalize("NFKD", question).encode("ascii", "ignore").decode().lower()
    birth = re.search(r"\b(?:nascimento|nasceu|nasci|idade|aniversario)\b", plain)
    owner = re.search(r"\b(?:leo(?:nardo)?|gutierrez|sato|meu|minha|meus|minhas|mim|eu|nasci)\b", plain)
    details = re.search(r"\b(?:bio(?:grafia)?|perfil|carreira|curriculo|formacao|estudos|faculdade|formou|"
                        r"certificad\w*|certificac\w*|experiencia|cargos?|empregos?|trabalh\w*)\b", plain)
    personal_languages = re.search(r"\b(?:linguagens?|tecnologias?)\b.*\b(?:us\w*|conhec\w*|domin\w*)\b", plain)
    try:
        data = json.loads((config.HERMES_HOME / "private/owner-profile.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    # A small professional identity is always available in the private chat.
    # Detailed career records are attached on demand, including pronoun follow-ups.
    fields = ("name", "website", "linkedin", "github", "bio", "skills", "sources")
    if details or personal_languages:
        fields += ("experience", "education", "certificates", "project_languages")
    if owner and birth:
        fields += ("birth_date",)
    return scrub({key: data[key] for key in fields if key in data})


def _project_overview(docs, commits, question):
    """Return bounded evidence per project, never infer a stack from its name."""
    repos = sorted({doc['repo'] for doc in docs if doc.get('repo')})
    recent = bool(_words(question) & {'recente', 'recentes', 'recentemente', 'ultimos', 'ultimas'})
    overview = []
    for repo in repos:
        sources = [doc for doc in docs if doc.get('repo') == repo]
        readmes = [doc for doc in sources if doc.get('type') == 'readme']
        metadata = next((doc for doc in sources if isinstance(doc.get('repository_metadata'), dict)), {})
        changes = sorted((doc for doc in commits if doc.get('repo') == repo),
                         key=lambda doc: str(doc.get('updated') or ''), reverse=True)
        if recent and not changes:
            continue
        readme = max(readmes, key=lambda doc: str(doc.get('updated') or ''), default={})
        overview.append({
            'repo': repo,
            'readme': {key: readme.get(key) for key in ('title', 'preview', 'url', 'updated')} if readme else None,
            'repository_metadata': metadata.get('repository_metadata', {}),
            'metadata_source': metadata.get('url'),
            'recent_changes': [{key: doc.get(key) for key in ('title', 'url', 'updated')} for doc in changes[:2]],
        })
    overview.sort(key=lambda item: (
        bool(item['readme']) if not recent else True,
        str(item['recent_changes'][0].get('updated') or '') if item['recent_changes'] else '',
        item['repo'],
    ), reverse=True)
    return overview[:6]


def _previous_repository(docs, previous):
    known = {doc.get("repo") for doc in docs}
    for turn in previous:
        if turn.get("repository") in known and turn.get("repository"):
            return turn["repository"]
        question = turn["question"]
        names = repository_names(docs, question)
        if names:
            return next(iter(names)) if len(names) == 1 else None
        if _words(question) & {"repo", "repositorio"}:
            summary, _ = _commit_context(docs, question)
            target = summary.get("ranked_repository") or summary.get("earliest_indexed_commit")
            if target:
                return target["repo"]
        # An explicit change to the person's career ends the previous project
        # reference; do not resurrect an older repository across that change.
        if _words(question) & {'sato', 'leonardo', 'dono', 'carreira', 'experiencia', 'formacao'}:
            return None
    return None


def collect(snapshot, question, previous=()):
    context = {}
    words = _words(question)
    plain = unicodedata.normalize("NFKD", question).encode("ascii", "ignore").decode().lower()
    if profile := _owner_profile(question):
        context["owner_profile"] = profile
    repository_question = bool(words & {"git", "github", "satolg", "repo", "repos", "repositorio", "repositorios",
                                        "commit", "commits", "rag", "indexado", "indexados"})
    repo_details = bool(words & {"linguagem", "linguagens", "stack", "readme", "extensao", "extensoes",
                                 "arquivos", "tecnologia", "tecnologias"})
    project_question = bool(words & {"projeto", "projetos", "portfolio", "portifolio", "trabalhos"}
                            or re.search(r"\b(?:fez|desenvolveu|construiu|criou)\b", plain))
    follow_up = bool(re.search(
        r"\b(?:des[st][ea]|nes[st][ea]|es[st][ea]|daquel[ea])\s+(?:reposit[oó]rio|repo|projeto)\b"
        r"|\b(?:linguagem|linguagens|extens[oõ]es|arquivos|stack|readme)\b.*\b(?:del[ea]|nel[ea])\b",
        question, re.I) or previous and re.fullmatch(
            r"\s*(?:e\s+)?(?:(?:qual|quais)\s+)?(?:(?:a|o|as|os)\s+)?(?:linguagem|stack|extens[oõ]es|arquivos)[?.\s]*",
            question, re.I) or previous and re.search(r"\b(?:ele|ela|dele|dela)\b", plain)
            and words & {'funciona', 'funcionamento', 'faz', 'serve', 'objetivo', 'melhorias', 'mudou'})
    # Explicit project names also work without a GitHub keyword. Avoid an index
    # read for every greeting; known names are loaded only for project requests.
    named_project = bool(re.search(r"\b(?:e o|e a|fala d[oa]|sobre [oa])\s+\S+", plain)
                         and not words & {'sato', 'leonardo', 'leo', 'dono'})
    if snapshot is None and not (repository_question or follow_up or repo_details or project_question or named_project):
        return context

    scope = (str(config.HERMES_HOME), str(config.RAG_PATH), str(Path.cwd()))
    if snapshot is not None:
        context.update(_collect_telemetry(snapshot, words, scope))
    vector, rag_freshness = CACHE.get(('rag', scope), _rag_version(), 30, _rag_catalog)
    context.setdefault("freshness", {})["rag"] = rag_freshness
    all_docs = vector.get("docs", [])
    summary, commit_docs = _commit_context(all_docs, question)
    if follow_up and not (summary["selected_repositories"] or "requested_rank" in summary
                          or summary.get("earliest_indexed_commit")):
        if repository := _previous_repository(all_docs, previous):
            summary, commit_docs = _commit_context(all_docs, question, repository=repository)
    summary["counts_are_exact_for_indexed_data"] = not bool(vector.get("error"))
    unresolved = follow_up and not (summary["selected_repositories"] or "requested_rank" in summary
                                   or summary.get("earliest_indexed_commit"))
    if unresolved:
        context["rag"] = {"reference_unresolved": True}
        return context
    if snapshot is None and not (repository_question or summary["selected_repositories"] or project_question):
        return context
    commit_question = bool(words & {"commit", "commits"})
    oldest = summary.get("earliest_indexed_commit")
    ranked = summary.get("ranked_repository")
    selected = set(summary["selected_repositories"])
    if oldest:
        selected = {oldest["repo"]}
        summary.pop("by_repo", None)
    elif ranked:
        selected = {ranked["repo"]}
    if not oldest and (selected or "requested_rank" in summary):
        # Aggregate counts are safe to keep. Excerpts and examples must belong
        # to the repository being described, including when it was chosen by rank.
        summary["by_repo"] = [
            group if group["repo"] in selected else {"repo": group["repo"], "commit_count": group["commit_count"]}
            for group in summary["by_repo"]
        ]
    if selected or "requested_rank" in summary:
        all_relevant = [doc for doc in all_docs if doc.get("repo") in selected]
    elif commit_question:
        all_relevant = commit_docs
    else:
        all_relevant = all_docs
    docs = sorted((doc for doc in all_relevant if doc.get("type") != "repository_metadata"),
                  key=lambda d: (bool(selected) and d.get("type") == "readme",
                                 len(words & _words(f"{d.get('title', '')} {d.get('preview', '')}")),
                                 str(d.get("updated", ""))), reverse=True)
    context["rag"] = {"total": vector.get("total"), "error": vector.get("error"),
                      "by_type": dict(Counter(d.get("type") or "doc" for d in all_docs)),
                      "sync": vector.get("sync", {"last_full_coverage_confirmed": False}),
                      "commit_summary": summary, "documents_are_partial": True,
                      "documents": [{key: item.get(key) for key in ("title", "repo", "type", "preview", "url", "updated")}
                                    for item in docs[:8]]}
    if selected:
        context["rag"]["target_repositories"] = sorted(selected)
        context["rag"]["repository_metadata"] = [
            {"repo": doc["repo"], **doc["repository_metadata"]}
            for doc in all_relevant if isinstance(doc.get("repository_metadata"), dict)
        ]
    elif project_question and 'requested_rank' not in summary:
        context['rag']['project_overview'] = _project_overview(all_docs, commit_docs, question)
        context['rag']['project_overview_is_partial'] = True
        if not commit_question:
            # The overview already carries each project's sources. Avoid
            # duplicating snippets and unrelated commit examples in the prompt.
            context['rag']['documents'] = []
            summary['by_repo'] = [{key: group[key] for key in ('repo', 'commit_count')}
                                  for group in summary['by_repo']]
    context["limits"] = "O índice local contém amostras de documentos e commits. Ele não substitui uma leitura do código atual."
    cleaned = scrub(context)
    # Retain the VM readings and document excerpts when a busy host has many runs.
    if snapshot is not None and len(json.dumps(cleaned, ensure_ascii=False)) > 80000:
        cleaned["workers"] = [w for w in cleaned["workers"] if str(w.get("id", "")).startswith("guide:")] + cleaned["workers"][:8]
        cleaned["events"] = cleaned["events"][:8]
        cleaned["limits"] += " A lista de execuções recentes foi reduzida para caber no contexto."
    return cleaned
