#!/usr/bin/env python3
"""Resumable GitHub history sync; never recreates the live LanceDB table.

First run scans every owned repository (including forks), every branch and
every history page. Later runs skip unchanged branch heads and scan every page
of changed branches, including backdated commits. --full rechecks all history. No author/date
filter is applied. Credentials are read in-process and never logged.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


class GitHub:
    def __init__(self, token):
        self.token = token

    def get(self, path, params=None):
        url = "https://api.github.com" + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        for attempt in range(4):
            request = urllib.request.Request(url, headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/vnd.github+json",
                "User-Agent": "hermes-rag-history-sync",
            })
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise RuntimeError(f"GitHub {path}: HTTP {error.code}") from None
            except (OSError, ValueError):
                if attempt == 3:
                    raise RuntimeError(f"GitHub {path}: request failed") from None
            time.sleep(2 ** attempt)

    def pages(self, path, params=None):
        page = 1
        while True:
            data = self.get(path, {**(params or {}), "per_page": 100, "page": page})
            if not isinstance(data, list):
                raise RuntimeError(f"GitHub {path}: expected a list")
            yield data
            if len(data) < 100:
                return
            page += 1


def commit_key(document):
    match = re.search(r"/commit/([0-9a-f]{40})$", document.get("url", ""))
    if document.get("type") == "commit" and match:
        return f"{document['repo']}/commit/{match.group(1)}"
    return document["id"]


def normalize_commits(table):
    """Upsert canonical copies before removing legacy duplicates; keep best text."""
    rows = table.to_arrow().to_pylist()
    best, obsolete, changed_keys = {}, [], set()
    for row in rows:
        key = commit_key(row)
        if row["id"] != key:
            obsolete.append(row["id"])
            changed_keys.add(key)
        if key not in best or len(row.get("content") or "") > len(best[key].get("content") or ""):
            best[key] = {**row, "id": key}
    changed = [best[key] for key in changed_keys]
    if changed:
        table.merge_insert("id").when_matched_update_all().when_not_matched_insert_all().execute(changed)
    for offset in range(0, len(obsolete), 100):
        ids = ",".join("'" + x.replace("'", "''") + "'" for x in obsolete[offset:offset + 100])
        table.delete(f"id IN ({ids})")
    print(f"Canonicalized {len(changed)} commits; removed {len(obsolete)} legacy rows", flush=True)
    return best


def commit_doc(repo, item):
    sha = item["sha"]
    commit = item["commit"]
    author = commit.get("author") or {}
    message = commit.get("message") or ""
    return {
        "id": f"{repo}/commit/{sha}", "repo": repo, "type": "commit",
        "title": f"Commit {sha[:7]}: {message.splitlines()[0] if message else '(no message)'}",
        "content": f"Commit {sha} in {repo}\nAuthor: {author.get('name', '')}\n"
                   f"Date: {author.get('date', '')}\nMessage:\n{message[:12000]}",
        "url": item.get("html_url") or f"https://github.com/{repo}/commit/{sha}",
        "state": "committed", "labels": "", "parent_id": repo,
        "updated": author.get("date") or (commit.get("committer") or {}).get("date", ""),
    }


def issue_doc(repo, item):
    is_pr = "pull_request" in item
    kind, path = ("pr", "pulls") if is_pr else ("issue", "issues")
    return {
        "id": f"{repo}/{path}/{item['number']}", "repo": repo, "type": kind,
        "title": f"PR #{item['number']}: {item['title']}" if is_pr else item["title"],
        "content": f"{'PR' if is_pr else 'Issue'} #{item['number']}: {item['title']}\n"
                   f"Repository: {repo}\nState: {item['state']}\n"
                   f"Author: {(item.get('user') or {}).get('login', '')}\n\n{(item.get('body') or '')[:12000]}",
        "url": item["html_url"], "state": item["state"],
        "labels": ",".join(x["name"] for x in item.get("labels", [])),
        "updated": item["updated_at"], "parent_id": repo,
    }


class Writer:
    def __init__(self, table, existing):
        self.table, self.existing, self.model = table, existing, None
        self.added = self.updated = 0

    def write(self, documents):
        import pyarrow as pa
        pending = []
        for doc in documents:
            old = self.existing.get(doc["id"])
            if old and old.get("updated") == doc.get("updated"):
                continue
            # Preserve previously fetched comments and diffs while metadata is unchanged.
            if old:
                self.updated += 1
            else:
                self.added += 1
            pending.append(doc)
        if not pending:
            return
        if self.model is None:
            from fastembed import TextEmbedding
            self.model = TextEmbedding(model_name=MODEL, max_length=512, threads=2)
        for start in range(0, len(pending), 16):
            batch = pending[start:start + 16]
            vectors = self.model.embed([doc["content"][:4000] for doc in batch], batch_size=1)
            for doc, vector in zip(batch, vectors):
                doc["vector"] = vector.tolist()
            data = pa.Table.from_pylist(batch, schema=self.table.schema)
            self.table.merge_insert("id").when_matched_update_all().when_not_matched_insert_all().execute(data)
            self.existing.update((doc["id"], doc) for doc in batch)
            print(f"Persisted: +{self.added} new, {self.updated} updated; {self.table.count_rows()} rows", flush=True)


def sync(api, writer, state, user, full=False):
    heads, coverage = {}, {}
    for page in api.pages("/user/repos", {"affiliation": "owner"}):
        for repo in page:
            if repo["owner"]["login"].lower() != user.lower():
                continue
            name = repo["full_name"]
            print(f"Repository: {name}", flush=True)
            branches = [branch for page in api.pages(f"/repos/{name}/branches") for branch in page]
            branches.sort(key=lambda b: b["name"] != repo["default_branch"])
            repo_seen = set()
            for branch in branches:
                key, head = f"{name}:{branch['name']}", branch["commit"]["sha"]
                if not full and state.get("heads", {}).get(key) == head:
                    heads[key] = head
                    continue
                for items in api.pages(f"/repos/{name}/commits", {"sha": branch["name"]}):
                    docs = [commit_doc(name, item) for item in items]
                    repo_seen.update(item["sha"] for item in items)
                    writer.write(docs)
                heads[key] = head
            coverage[name] = {"branches": len(branches), "visited_unique_commits": len(repo_seen)}
            params = {"state": "all"}
            if not full and state.get("completed_at"):
                # Overlap protects against updates concurrent with the previous run.
                last = dt.datetime.fromisoformat(state["completed_at"])
                params["since"] = (last - dt.timedelta(days=2)).isoformat()
            for items in api.pages(f"/repos/{name}/issues", params):
                docs = []
                for item in items:
                    doc = issue_doc(name, item)
                    old = writer.existing.get(doc["id"])
                    if item.get("comments") and (not old or old.get("updated") != doc["updated"]):
                        comments = [c.get("body") or "" for page in api.pages(
                            f"/repos/{name}/issues/{item['number']}/comments") for c in page]
                        doc["content"] += "\n\nComments:\n" + "\n".join(comments)[:16000]
                    docs.append(doc)
                writer.write(docs)
    return heads, coverage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--user", default="satoLG")
    parser.add_argument("--db", type=Path, default=Path.home() / "rag-db")
    parser.add_argument("--state", type=Path, default=Path.home() / ".hermes/rag_commit_state/sync.json")
    args = parser.parse_args()
    args.state.parent.mkdir(parents=True, exist_ok=True)
    with (args.state.parent / "sync.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another RAG sync is running") from None
        import lancedb
        import yaml
        cfg = yaml.safe_load((Path.home() / ".hermes/config.yaml").read_text())
        token = os.environ.get("GITHUB_TOKEN") or cfg["mcp_servers"]["github"]["env"]["GITHUB_PERSONAL_ACCESS_TOKEN"]
        table = lancedb.connect(str(args.db)).open_table("github_docs")
        if table.schema.field("vector").type.list_size != 384:
            raise RuntimeError("Expected the existing 384-dimensional embedding schema")
        started_at = dt.datetime.now(dt.timezone.utc).isoformat()
        state = json.loads(args.state.read_text()) if args.state.exists() else {}
        writer = Writer(table, normalize_commits(table))
        heads, coverage = sync(GitHub(token), writer, state, args.user, args.full or not state.get("complete"))
        # Only advance after every API page and database write succeeded.
        result = {"complete": True, "completed_at": started_at, "heads": heads,
                  "coverage": coverage, "added": writer.added, "updated": writer.updated,
                  "total_rows": table.count_rows(), "model": MODEL}
        temporary = args.state.with_suffix(".tmp")
        temporary.write_text(json.dumps(result, indent=2))
        temporary.replace(args.state)
        print("SYNC COMPLETE " + json.dumps(result), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"SYNC FAILED: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
