#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

uv build
package_tmp="$(mktemp -d)"
trap 'rm -rf -- "$package_tmp"' EXIT
uv venv --python 3.11 "$package_tmp/venv"
uv pip install --python "$package_tmp/venv/bin/python" dist/ic_evidence_lab-0.1.0-py3-none-any.whl
"$package_tmp/venv/bin/ic-evidence-lab" --help >/dev/null
"$package_tmp/venv/bin/underwriting-lab" --help >/dev/null
"$package_tmp/venv/bin/python" - <<'PY'
from importlib import resources

schemas = resources.files("underwriting_lab.schemas")
required = {
    "analysis-receipt.schema.json",
    "dataroom-manifest.schema.json",
    "decision-record.schema.json",
    "scenario-book.schema.json",
    "thesis-graph.schema.json",
}
assert required.issubset({item.name for item in schemas.iterdir()})
PY
