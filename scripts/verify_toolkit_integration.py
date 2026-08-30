#!/usr/bin/env python3
"""Require the released toolkit gates at the candidate integration boundary."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ic_evidence_lab.toolkit_adapter import verify_release_bundle


ARTIFACTS = ("packet.json", "receipt.json", "memo.md")


def verify(root: Path) -> dict[str, object]:
    missing = [name for name in ARTIFACTS if not (root / name).is_file()]
    if missing:
        raise RuntimeError(f"toolkit-integration FAIL: missing artifacts: {', '.join(missing)}")
    result = verify_release_bundle(root, list(ARTIFACTS))
    status = result.get("status")
    if status != "PASS":
        reason = result.get("reason", "no reason returned")
        raise RuntimeError(f"toolkit-integration FAIL: status={status} reason={reason}")
    if len(result.get("evidence_receipts", [])) != len(ARTIFACTS):
        raise RuntimeError("toolkit-integration FAIL: evidence receipt count mismatch")
    release_receipt = result.get("release_receipt")
    if not isinstance(release_receipt, dict) or release_receipt.get("status") != "PASS":
        raise RuntimeError("toolkit-integration FAIL: release receipt did not pass")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="dist/verify-after")
    args = parser.parse_args()
    result = verify(Path(args.root).resolve(strict=True))
    print(
        json.dumps(
            {
                "artifacts": len(ARTIFACTS),
                "schema_version": result.get("schema_version"),
                "status": "PASS",
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
