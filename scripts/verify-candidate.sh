#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# The candidate verifier must work from a clean clone rather than relying on a
# previously populated virtual environment. Keep the declared lockfile frozen
# while materializing only the extras exercised below.
uv sync --frozen --extra dev --extra quality --extra demo

uv run bash scripts/verify-all.sh
uv run bash scripts/verify-underwriting.sh
uv run bash scripts/verify-security.sh
bash scripts/verify-package.sh
