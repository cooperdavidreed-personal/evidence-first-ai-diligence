#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

python -m ruff check .
python -m bandit -q -r src scripts -x tests -ll
uv export --format requirements-txt --all-extras --no-hashes --no-emit-project \
  | python -m pip_audit -r /dev/stdin
