#!/usr/bin/env bash
set -euo pipefail
exec "$HOME/rag-env/bin/python" -u "$HOME/rag-env/sync_github_rag.py" "$@"
