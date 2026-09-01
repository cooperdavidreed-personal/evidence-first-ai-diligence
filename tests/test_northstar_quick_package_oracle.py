from __future__ import annotations

import json
from pathlib import Path

from tests.oracles.northstar_reference import calculate, file_receipt

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "workbench" / "public" / "sample-package"
EXPECTED = json.loads((ROOT / "tests" / "fixtures" / "northstar_expected.json").read_text(encoding="utf-8"))


def test_public_sample_files_are_digest_bound() -> None:
    manifest = json.loads((PACKAGE / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["package_version"] == EXPECTED["package_version"]
    declared = {item["name"]: {"bytes": item["bytes"], "sha256": item["sha256"]} for item in manifest["files"]}
    assert declared == EXPECTED["files"]
    assert {name: file_receipt(PACKAGE / name) for name in EXPECTED["files"]} == EXPECTED["files"]


def test_independent_decimal_oracle_reproduces_northstar() -> None:
    assert calculate(PACKAGE) == EXPECTED["outputs"]
