from hermes_dashboard.rag import build_graph


def test_graph_pages_make_every_commit_reachable_without_dropping_older_history():
    docs = [{"id": str(i), "repo": "satoLG/r", "type": "commit", "title": f"Commit {i}",
             "updated": f"2026-09-{i % 28 + 1:02d}", "preview": "message"} for i in range(145)]
    parent, seen = "cat:satoLG/r:commit", []
    while parent:
        result = build_graph(docs, parent)
        seen.extend(n["id"] for n in result["nodes"] if n["kind"] == "doc")
        pages = [n for n in result["nodes"] if n["kind"] == "category"]
        parent = pages[0]["id"] if pages else None
    assert len(seen) == len(set(seen)) == 145
    assert set(seen) == {f"doc:{i}" for i in range(145)}
