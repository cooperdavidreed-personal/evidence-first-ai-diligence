#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

uv run python -m pytest
uv run python scripts/scan_public.py
uv run python -m ic_evidence_lab.cli run --case examples/vectorforge/case-before.json --out dist/verify-before
uv run python -m ic_evidence_lab.cli run --case examples/vectorforge/case-after.json --out dist/verify-after
uv run python -m ic_evidence_lab.cli run --case examples/vectorforge/case-after.json --out dist/verify-after-repeat
uv run python -m ic_evidence_lab.cli regression --out dist/regression-results.json
cmp dist/verify-after/packet.json dist/verify-after-repeat/packet.json
cmp dist/verify-after/receipt.json dist/verify-after-repeat/receipt.json
