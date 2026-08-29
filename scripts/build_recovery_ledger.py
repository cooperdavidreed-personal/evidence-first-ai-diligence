from __future__ import annotations

import argparse

from underwriting_lab.contracts import read_json
from underwriting_lab.verification import build_recovery_ledger


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="verification/underwriting-recovery.json")
    args = parser.parse_args()
    destination = build_recovery_ledger(args.out)
    print(destination)
    return 0 if read_json(destination)["summary"]["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
