#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

uv run python -m ruff check .
uv run python -m bandit -q -r src scripts -x tests -ll
uv export --format requirements-txt --all-extras --no-hashes --no-emit-project \
  | uv run python -m pip_audit -r /dev/stdin
pnpm --dir workbench audit --prod --audit-level high
