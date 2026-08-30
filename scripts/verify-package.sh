#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

package_tmp="$(mktemp -d)"
trap 'rm -rf -- "$package_tmp"' EXIT
uv build --out-dir "$package_tmp/build"
uv venv --python 3.11 "$package_tmp/venv"
wheel_paths=("$package_tmp"/build/*.whl)
if [ "${#wheel_paths[@]}" -ne 1 ] || [ ! -f "${wheel_paths[0]}" ]; then
  echo "package-verification FAIL: expected exactly one wheel" >&2
  exit 1
fi
uv pip install --python "$package_tmp/venv/bin/python" "${wheel_paths[0]}"
"$package_tmp/venv/bin/ic-evidence-lab" --help >/dev/null
"$package_tmp/venv/bin/underwriting-lab" --help >/dev/null
"$package_tmp/venv/bin/python" - <<'PY'
from importlib import resources

expected_underwriting = {
    "analysis-receipt.schema.json",
    "dataroom-manifest.schema.json",
    "debt-schedule-v2.schema.json",
    "decision-record.schema.json",
    "formula-registry-entry-v2.schema.json",
    "pe-case-result-v2.schema.json",
    "pe-distribution-v2.schema.json",
    "pe-sensitivity-book-v2.schema.json",
    "pe-sensitivity-cell-v2.schema.json",
    "pe-value-creation-bridge-v2.schema.json",
    "scenario-book.schema.json",
    "source-locator-v2.schema.json",
    "source-locator-v3.schema.json",
    "sources-and-uses-v2.schema.json",
    "temporal-scan-v1.schema.json",
    "thesis-graph.schema.json",
    "typed-metric-v2.schema.json",
    "vc-capitalization-v2.schema.json",
    "vc-case-result-v2.schema.json",
    "vc-distribution-v2.schema.json",
    "vc-financing-event-v2.schema.json",
    "vc-waterfall-v2.schema.json",
    "workbench-case-v2.schema.json",
    "workbench-data-v2.schema.json",
}
expected_kernel = {
    "case.schema.json",
    "gold-label.schema.json",
    "packet.schema.json",
    "receipt.schema.json",
}

def json_assets(package: str) -> set[str]:
    return {
        item.name
        for item in resources.files(package).iterdir()
        if item.is_file() and item.name.endswith(".json")
    }

assert json_assets("underwriting_lab.schemas") == expected_underwriting
assert json_assets("ic_evidence_lab.schemas") == expected_kernel
print(
    "package-verification=PASS "
    f"underwriting_schemas={len(expected_underwriting)} kernel_schemas={len(expected_kernel)}"
)
PY
