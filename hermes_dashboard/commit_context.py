import calendar
import re
import unicodedata
from datetime import datetime, timedelta, timezone

def _words(text):
    plain = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode().lower()
    return set(re.findall(r"[a-z0-9_]{3,}", plain)) - {"que", "com", "uma", "para", "sobre", "como", "qual", "the", "and"}


def _commit_context(docs, question, now=None):
    """Count the whole catalog, deduplicated by URL; examples never imply totals."""
    now = now or datetime.now(timezone.utc)
    plain = unicodedata.normalize("NFKD", question).encode("ascii", "ignore").decode().lower()
    commits = {}
    for doc in docs:
        if doc.get("type") == "commit":
            commits.setdefault(doc.get("url") or doc.get("id"), doc)
    since, until = None, now
    period = re.search(r"(?:ultim[oa]s?|last|past)\s+(\d+)\s+(dias?|days?|mes(?:es)?|months?|anos?|years?)", plain)
    if period:
        count, unit = min(int(period[1]), 1200), period[2]
        if unit.startswith(("dia", "day")):
            since = now - timedelta(days=count)
        else:
            months = count * 12 if unit.startswith(("ano", "year")) else count
            month = now.year * 12 + now.month - 1 - months
            year, month0 = divmod(month, 12)
            if year >= 1:
                since = now.replace(year=year, month=month0 + 1,
                                    day=min(now.day, calendar.monthrange(year, month0 + 1)[1]))
    dates = re.findall(r"\b\d{4}-\d{2}-\d{2}\b", plain)
    if dates:
        try:
            since = datetime.fromisoformat(dates[0]).replace(tzinfo=timezone.utc)
            if len(dates) > 1:
                until = datetime.fromisoformat(dates[1]).replace(tzinfo=timezone.utc) + timedelta(days=1)
        except ValueError:
            pass
    repos = {d.get("repo") for d in commits.values() if d.get("repo")}
    selected = {r for r in repos if r.lower() in plain or
                re.search(r"(?<![\w-])" + re.escape(r.split("/")[-1].lower()) + r"(?![\w-])", plain)}
    groups, matches, unknown_dates = {}, [], 0
    for doc in commits.values():
        if selected and doc.get("repo") not in selected:
            continue
        stamp = doc.get("updated") or doc.get("created_at")
        if not stamp:
            match = re.search(r"(?m)^Date:\s*(\S+)", doc.get("preview", ""))
            stamp = match[1] if match else ""
        try:
            when = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
            if not when.tzinfo:
                when = when.replace(tzinfo=timezone.utc)
        except ValueError:
            when = None
        if since is not None and when is None:
            unknown_dates += 1
            continue
        if since is not None and not (since <= when < until):
            continue
        item = {**doc, "updated": stamp}
        matches.append(item)
        groups.setdefault(doc.get("repo") or "sem repo", []).append(item)
    ranked = sorted(groups.items(), key=lambda pair: (-len(pair[1]), pair[0]))
    words = _words(question) - {"commit", "commits", "repositorio", "repositorios"}
    by_repo = []
    for repo, items in ranked:
        # Recent items break lexical ties; no author filter is inferred from ownership.
        examples = sorted(items, key=lambda d: (len(words & _words(d.get("preview", "") + " " + d.get("title", ""))),
                                               str(d.get("updated", ""))), reverse=True)[:8]
        by_repo.append({"repo": repo, "commit_count": len(items), "examples_are_partial": len(items) > len(examples),
                        "examples": [{k: d.get(k) for k in ("title", "updated", "url")} for d in examples]})
    summary = {"source": "complete indexed catalog, deduplicated by commit URL",
               "indexed_unique_commits": len(commits), "matching_commits": len(matches),
               "since": since.isoformat() if since else None, "until": until.isoformat() if since else None,
               "date_field": "Git author date", "author_scope": "all authors in the selected repositories",
               "selected_repositories": sorted(selected), "unknown_dates_excluded": unknown_dates,
               "by_repo": by_repo[:64], "repository_groups_truncated": max(0, len(by_repo) - 64),
               "counts_are_exact_for_indexed_data": True,
               "topic_examples_are_partial": True}
    return summary, matches
