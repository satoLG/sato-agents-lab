#!/usr/bin/env python3
"""Semantic examples, or exact commit counts with --summary; no inference calls."""
import argparse
import importlib.util
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("question", nargs="?", default="architecture decisions")
    parser.add_argument("limit", nargs="?", type=int, default=5)
    parser.add_argument("--summary", action="store_true")
    args = parser.parse_args()
    import lancedb
    table = lancedb.connect(str(Path.home() / "rag-db")).open_table("github_docs")
    if args.summary:
        helper = Path(__file__).with_name("commit_context.py")
        if not helper.exists():
            helper = Path(__file__).parents[1] / "hermes_dashboard/commit_context.py"
        spec = importlib.util.spec_from_file_location("commit_context", helper)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        docs = [{k: v for k, v in d.items() if k != "vector"} for d in table.to_arrow().to_pylist()]
        for doc in docs:
            doc["preview"] = doc.get("content", "")[:2000]
        summary, _ = module._commit_context(docs, args.question)
        state = Path.home() / ".hermes/rag_commit_state/sync.json"
        summary["sync"] = json.loads(state.read_text()) if state.exists() else {"complete": False}
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        from fastembed import TextEmbedding
        model = TextEmbedding(model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", max_length=512, threads=2)
        vector = next(iter(model.embed([args.question[:4000]]))).tolist()
        rows = table.search(vector).limit(max(1, min(args.limit, 50))).to_arrow().to_pylist()
        print("PARTIAL semantic examples; this is not a count/ranking of all commits.")
        for row in rows:
            print(f"\n--- {row['title']} ({row['type']}) [{row['repo']}] ---\n"
                  f"URL: {row['url']}\nContent: {row['content'][:1200]}")


if __name__ == "__main__":
    main()
