import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("github_sync", Path(__file__).parents[1] / "tools/sync_github_rag.py")
syncer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(syncer)


def commit(n):
    return {"sha": f"{n:040x}", "commit": {"message": f"change {n}",
            "author": {"name": "Any author", "date": "2010-01-01T00:00:00Z"}}}


def test_pagination_follows_second_page_and_fails_on_api_error():
    api = syncer.GitHub("not-a-real-token")
    calls = []
    def get(path, params):
        calls.append(params)
        return list(range(100)) if params["page"] == 1 else [100]
    api.get = get
    assert len([x for page in api.pages("/history", {"sha": "main"}) for x in page]) == 101
    assert [p["page"] for p in calls] == [1, 2]
    assert all(p["per_page"] == 100 and p["sha"] == "main" for p in calls)
    api.get = lambda *_: {"message": "rate limited"}
    with pytest.raises(RuntimeError, match="expected a list"):
        list(api.pages("/history"))


class API:
    def pages(self, path, params=None):
        if path == "/user/repos":
            yield [{"full_name": "satoLG/fork", "owner": {"login": "satoLG"},
                    "fork": True, "default_branch": "main"}]
        elif path.endswith("/branches"):
            yield [{"name": "main", "commit": {"sha": "a"}}, {"name": "old", "commit": {"sha": "b"}}]
        elif path.endswith("/commits"):
            if params["sha"] == "main":
                yield [commit(i) for i in range(100)]
                yield [commit(100)]
            else:
                yield [commit(100), commit(101)]
        elif path.endswith("/issues"):
            yield []
        else:
            raise AssertionError(path)


class Writer:
    def __init__(self):
        self.existing = {}
    def write(self, docs):
        self.existing.update((d["id"], d) for d in docs)


def test_full_import_includes_old_commits_forks_all_branches_and_deduplicates():
    writer = Writer()
    heads, coverage = syncer.sync(API(), writer, {}, "satoLG", full=True)
    assert len(writer.existing) == 102
    assert {d["updated"] for d in writer.existing.values()} == {"2010-01-01T00:00:00Z"}
    assert coverage["satoLG/fork"]["visited_unique_commits"] == 102
    assert len(heads) == 2


def test_unchanged_heads_skip_history_but_still_refresh_issues():
    class Unchanged(API):
        def pages(self, path, params=None):
            assert not path.endswith("/commits")
            yield from super().pages(path, params)
    heads, _ = syncer.sync(Unchanged(), Writer(), {
        "complete": True, "heads": {"satoLG/fork:main": "a", "satoLG/fork:old": "b"}}, "satoLG")
    assert len(heads) == 2


def test_failed_page_does_not_return_a_successful_checkpoint():
    class Failing(API):
        def pages(self, path, params=None):
            if path.endswith("/commits"):
                yield [commit(1)]
                raise RuntimeError("API unavailable")
            yield from super().pages(path, params)
    state = {"complete": True, "heads": {"existing": "old"}}
    with pytest.raises(RuntimeError, match="API unavailable"):
        syncer.sync(Failing(), Writer(), state, "satoLG", full=True)
    assert state == {"complete": True, "heads": {"existing": "old"}}


def test_changed_branch_checks_later_pages_even_if_first_page_is_already_known():
    writer = Writer()
    writer.write([syncer.commit_doc("satoLG/fork", commit(i)) for i in range(100)])
    syncer.sync(API(), writer, {"complete": True, "heads": {}}, "satoLG")
    assert len(writer.existing) == 102


def test_canonicalization_keeps_richer_content_vector_and_unrelated_documents(tmp_path):
    db = pytest.importorskip("lancedb").connect(str(tmp_path))
    old = syncer.commit_doc("satoLG/repo", commit(1))
    old.update(id="satoLG/repo/commits/0000000", vector=[0.1, 0.2], content="message with useful diff")
    duplicate = {**old, "id": syncer.commit_key(old), "content": "short", "vector": [0.9, 0.9]}
    issue = {**old, "id": "issue-1", "type": "issue", "url": "https://github.com/satoLG/repo/issues/1"}
    table = db.create_table("github_docs", [old, duplicate, issue])
    stored_vector = table.to_arrow().to_pylist()[0]["vector"]
    syncer.normalize_commits(table)
    rows = table.to_arrow().to_pylist()
    assert len(rows) == 2
    saved = next(d for d in rows if d["type"] == "commit")
    assert saved["id"] == syncer.commit_key(old)
    assert saved["content"] == old["content"] and saved["vector"] == stored_vector
    syncer.normalize_commits(table)
    assert table.count_rows() == 2
