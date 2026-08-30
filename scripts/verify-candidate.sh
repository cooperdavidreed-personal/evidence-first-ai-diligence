#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

require_clean_candidate() {
  local phase="$1"
  if ! git diff --quiet --ignore-submodules --; then
    echo "candidate-cleanliness FAIL: tracked working-tree changes at $phase" >&2
    git status --short >&2
    exit 1
  fi
  if ! git diff --cached --quiet --ignore-submodules --; then
    echo "candidate-cleanliness FAIL: staged changes at $phase" >&2
    git status --short >&2
    exit 1
  fi
  local untracked
  untracked="$(git ls-files --others --exclude-standard)"
  if [ -n "$untracked" ]; then
    echo "candidate-cleanliness FAIL: undeclared untracked files at $phase" >&2
    printf '%s\n' "$untracked" >&2
    exit 1
  fi
}

require_clean_candidate start

# The candidate verifier must work from a clean clone rather than relying on a
# previously populated virtual environment. Keep the declared lockfile frozen
# while materializing only the extras exercised below.
uv sync --frozen --extra dev --extra quality --extra demo --extra toolkit

uv run bash scripts/verify-all.sh
uv run python scripts/verify_toolkit_integration.py --root dist/verify-after
uv run bash scripts/verify-underwriting.sh
uv run bash scripts/verify-security.sh
bash scripts/verify-package.sh

require_clean_candidate end
echo "candidate-cleanliness=PASS tracked=UNCHANGED staged=UNCHANGED untracked=DECLARED_OR_IGNORED"
