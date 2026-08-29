#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

uv run bash scripts/verify-all.sh
uv run bash scripts/verify-underwriting.sh
uv run bash scripts/verify-security.sh
bash scripts/verify-package.sh
