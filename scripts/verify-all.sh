#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

python -m pytest
python scripts/scan_public.py
python -m ic_evidence_lab.cli run --case examples/vectorforge/case-before.json --out dist/verify-before
python -m ic_evidence_lab.cli run --case examples/vectorforge/case-after.json --out dist/verify-after
python -m ic_evidence_lab.cli run --case examples/vectorforge/case-after.json --out dist/verify-after-repeat
cmp dist/verify-after/packet.json dist/verify-after-repeat/packet.json
cmp dist/verify-after/receipt.json dist/verify-after-repeat/receipt.json
