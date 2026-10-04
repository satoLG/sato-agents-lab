# GitHub RAG synchronization on sato-agents-vm

The live database is `/home/leona/rag-db`, table `github_docs`. The importer in
`tools/sync_github_rag.py` is installed as `~/rag-env/sync_github_rag.py`, using the
existing rag-env dependencies and the existing 384-dimensional embedding model.
`tools/update_rag.sh` is installed under `~/.hermes/scripts/update-rag.sh`.

The initial historical run scans every repository owned by satoLG, including
forks and private repos accessible to the credential, every branch, and every
API page. There is no date or author filter. Commit documents store full SHA,
repo, author date, author, title and message. Previously indexed diffs are kept;
new commits are metadata/message documents, not full code/diff snapshots.
Issues and PRs also refresh through the paginated issues endpoint, with comments.
Existing READMEs and other document types are preserved.

```bash
# Full historical reconciliation, resumable without duplicates:
~/.hermes/scripts/update-rag.sh --full
# Incremental run:
~/.hermes/scripts/update-rag.sh
# Inspect the last successfully completed checkpoint:
cat ~/.hermes/rag_commit_state/sync.json
# Exact counts, ranking and bounded topic examples (all indexed rows):
~/rag-env/bin/python ~/rag-env/query_rag.py --summary "commits nos últimos 3 meses"
# Semantic examples, preserving the existing CLI:
~/rag-env/bin/python ~/rag-env/query_rag.py "shader portfolio" 5
```

Daily Hermes cron job `d8ae4867aa60` runs at 11:00 UTC (08:00 Sao Paulo), with
`script=update-rag.sh`, `no_agent=true`, local delivery. It calls no inference
model. A process lock prevents simultaneous writes. GitHub failures produce a
nonzero exit and never advance the checkpoint. Batch writes allow resuming a
failed import without re-embedding already saved commits.

Ordinary updates skip unchanged branch heads; changed branches traverse every
history page so backdated commits are not skipped. A full run revisits all branches. Repository ownership
does not imply commit authorship. Commits shared by branches are stored once,
with canonical ID `owner/repo/commit/FULL_SHA`. Legacy duplicates are upserted
before deletion, preserving the richest existing text and its vector.

The Flask chat remains tool-free. Its server computes `rag.commit_summary` from
the complete indexed catalog, deduplicates URLs and filters author dates and
repositories for the question. Exact counts and ranking are separate from
partial topic examples. `rag.sync` describes the last completed import; it does
not prove an in-progress run has completed. The normal semantic top-N search
must never be interpreted as a total count or proof of absence.

Dashboard RAG > Lista includes a Commits filter, repository filter and title/SHA
search. Categories in the Dashboard and Lab graph provide next-page nodes;
the Lab replaces the selected branch so its 180-node visual cap cannot hide
newly selected categories.

## Backup and rollback

Before the historical import a copy of the original database, scripts, job
configuration and Hermes skill was saved to
`~/.hermes/rag-backup-20261004/`. Restoring a database requires first stopping
the import and preventing the cron from running. Preserve the current database
under a new name before restoring the backup; never delete it or recreate the
table as part of a normal update. Legacy update/index entrypoints now redirect
to the safe importer instead of recreating the live table.

The live app checkout stays on main. App changes are delivered through a PR;
the owner merges it, then the existing updater safely fast-forwards main and
restarts Flask. The independent RAG importer and cron can operate before that
app deployment.
