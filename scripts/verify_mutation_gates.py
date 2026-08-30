#!/usr/bin/env python3
"""Execute the frozen model-integrity falsification ledger."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "verification" / "mutation-gates.json"
EXPECTED_MUTANTS = {
    "accepted-abstention-as-global-hold",
    "amortization-off-by-one",
    "display-only-sensitivity",
    "earnout-as-certain-haircut",
    "first-n-treatment-assignment",
    "global-series-c-conversion-choice",
    "hard-coded-exit-debt",
    "interest-balance-convention-change",
    "moic-cagr-as-xirr",
    "parse-float-finance-path",
    "participation-cap-removal",
    "quantile-as-scenario",
    "residual-dilution-scalar",
    "seniority-swap",
    "stored-covenant-status-trust",
    "sweep-sign-reversal",
}


def main() -> int:
    payload = json.loads(LEDGER.read_text())
    if payload.get("status") != "FROZEN":
        raise SystemExit("mutation-gates FAIL: ledger is not frozen")
    mutants = payload.get("mutants", [])
    mutant_ids = [item.get("mutant_id") for item in mutants]
    if len(mutant_ids) != len(set(mutant_ids)) or set(mutant_ids) != EXPECTED_MUTANTS:
        raise SystemExit("mutation-gates FAIL: mutant inventory mismatch")

    finance_sources = [
        path
        for path in (ROOT / "workbench" / "src").rglob("*.ts*")
        if "data" not in path.relative_to(ROOT / "workbench" / "src").parts
    ]
    if any("parseFloat" in path.read_text() for path in finance_sources):
        raise SystemExit("mutation-gates FAIL: parseFloat found on frontend source path")

    nodeids = sorted(
        {
            item["test_nodeid"]
            for item in mutants
            if item["test_nodeid"] != "STATIC_NO_PARSEFLOAT"
        }
    )
    for nodeid in nodeids:
        path = ROOT / nodeid.split("::", 1)[0]
        function_name = nodeid.rsplit("::", 1)[-1]
        if not path.is_file() or f"def {function_name}(" not in path.read_text():
            raise SystemExit(f"mutation-gates FAIL: missing test node {nodeid}")
    completed = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", *nodeids],
        cwd=ROOT,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit("mutation-gates FAIL: falsification fixture failed")
    print(
        "mutation-gates=PASS "
        f"declared={len(mutants)} dynamic={len(nodeids)} static=1 whole_program_score=NOT_CLAIMED"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
