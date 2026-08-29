#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

uv run pytest tests/test_underwriting_lab.py
uv run underwriting-lab generate --case atlasgrid --seed 20260828 --out dist/underwriting/atlasgrid
uv run underwriting-lab analyze --manifest dist/underwriting/atlasgrid/case/manifest.json --out dist/underwriting/atlasgrid/analysis.json
uv run underwriting-lab generate --case helios --seed 20260829 --out dist/underwriting/helios
uv run underwriting-lab analyze --manifest dist/underwriting/helios/case/manifest.json --out dist/underwriting/helios/analysis.json
uv run underwriting-lab build-workbench \
  --cases dist/underwriting/atlasgrid/analysis.json dist/underwriting/helios/analysis.json \
  --out workbench/src/data/cases.json
