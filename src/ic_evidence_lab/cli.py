from __future__ import annotations

import argparse
import json
from pathlib import Path

from .benchmark import run_benchmark
from .canonical import canonical_json
from .pipeline import CaseError, write_outputs
from .toolkit_adapter import verify_packet


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ic-evidence-lab")
    subparsers = parser.add_subparsers(dest="command", required=True)
    run = subparsers.add_parser("run", help="run one frozen, local diligence case")
    run.add_argument("--case", required=True)
    run.add_argument("--out", required=True)
    run.add_argument("--toolkit", action="store_true")
    benchmark = subparsers.add_parser("benchmark", help="run the 24-case offline benchmark")
    benchmark.add_argument("--out", required=True)
    benchmark.add_argument("--root", default=".", help="repository root containing benchmark/ and examples/")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "benchmark":
        repo = Path(args.root).resolve(strict=True)
        results = run_benchmark(repo)
        destination = Path(args.out)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(canonical_json(results) + b"\n")
        print(json.dumps({"status": results["status"], "matched": results["matched"], "total": results["total"], "output": destination.as_posix()}, sort_keys=True))
        return 0 if results["status"] == "PASS" else 1
    try:
        packet_path, receipt_path, memo_path = write_outputs(args.case, args.out)
    except CaseError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, sort_keys=True))
        return 2
    result: dict[str, object] = {
        "status": "PRODUCED",
        "packet": packet_path.as_posix(),
        "receipt": receipt_path.as_posix(),
        "memo": memo_path.as_posix(),
    }
    if args.toolkit:
        result["toolkit"] = verify_packet(Path(args.out), packet_path.name)
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
