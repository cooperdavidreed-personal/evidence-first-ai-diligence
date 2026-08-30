#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

uv run pytest
uv run python scripts/verify_mutation_gates.py
uv run underwriting-lab generate --case atlasgrid --seed 20260828 --out dist/underwriting/atlasgrid
uv run python scripts/sync_portfolio_source_rooms.py --case atlasgrid --manifest dist/underwriting/atlasgrid/case/manifest.json
uv run underwriting-lab analyze --manifest dist/underwriting/atlasgrid/case/manifest.json --out dist/underwriting/atlasgrid/analysis.json
uv run underwriting-lab generate --case helios --seed 20260829 --out dist/underwriting/helios
uv run python scripts/sync_portfolio_source_rooms.py --case helios --manifest dist/underwriting/helios/case/manifest.json
uv run underwriting-lab analyze --manifest dist/underwriting/helios/case/manifest.json --out dist/underwriting/helios/analysis.json
uv run underwriting-lab build-workbench \
  --cases dist/underwriting/atlasgrid/analysis.json dist/underwriting/helios/analysis.json \
  --out workbench/src/data/cases.json
uv run underwriting-lab verify-estimator-coverage \
  --case atlasgrid \
  --out verification/atlasgrid-estimator-coverage.json
uv run underwriting-lab verify-estimator-coverage \
  --case helios \
  --out verification/helios-estimator-coverage.json
uv run underwriting-lab build-memo \
  --analysis dist/underwriting/atlasgrid/analysis.json \
  --out-dir portfolio/atlasgrid
uv run underwriting-lab build-memo \
  --analysis dist/underwriting/helios/analysis.json \
  --out-dir portfolio/helios
uv run python scripts/build_recovery_ledger.py

cd workbench
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:e2e
cd ..
uv run python scripts/verify_visual_regression.py
uv run python scripts/verify_pdf_contract.py
uv run python scripts/build_visual_manifest.py
