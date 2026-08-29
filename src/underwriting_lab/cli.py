from __future__ import annotations

import argparse
import json
from pathlib import Path

from ic_evidence_lab.canonical import canonical_json

from .analysis import analyze_room
from .contracts import UnderwritingError, validate_workbench_case
from .generator import CASE_IDS, generate_room
from .memo import build_ic_packet


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="underwriting-lab")
    subparsers = parser.add_subparsers(dest="command", required=True)
    generate = subparsers.add_parser("generate", help="generate a deterministic synthetic data room")
    generate.add_argument("--case", required=True, choices=sorted(CASE_IDS))
    generate.add_argument("--seed", required=True, type=int)
    generate.add_argument("--out", required=True)
    analyze = subparsers.add_parser("analyze", help="analyze a generated room without reading verification truth")
    analyze.add_argument("--manifest", required=True)
    analyze.add_argument("--out", required=True)
    build = subparsers.add_parser("build-workbench", help="compile analyzed cases into one static frontend data file")
    build.add_argument("--cases", nargs="+", required=True)
    build.add_argument("--out", required=True)
    memo = subparsers.add_parser("build-memo", help="build a deterministic AtlasGrid IC memo and appendix")
    memo.add_argument("--analysis", required=True)
    memo.add_argument("--out-dir", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "generate":
            result = generate_room(args.case, args.seed, args.out)
            print(json.dumps({"status": "PRODUCED", "manifest": result.as_posix()}, sort_keys=True))
            return 0
        if args.command == "analyze":
            result = analyze_room(args.manifest, args.out)
            print(json.dumps({"status": "PRODUCED", "analysis": result.as_posix()}, sort_keys=True))
            return 0
        if args.command == "build-memo":
            artifacts = build_ic_packet(args.analysis, args.out_dir)
            print(json.dumps({"status": "PRODUCED", "artifacts": {key: value.as_posix() for key, value in artifacts.items()}}, sort_keys=True))
            return 0
        cases = [json.loads(Path(path).read_text(encoding="utf-8")) for path in args.cases]
        case_ids = [case["caseId"] for case in cases]
        if sorted(case_ids) != ["atlasgrid", "helios"]:
            raise UnderwritingError("workbench_requires_exactly_atlasgrid_and_helios")
        for case in cases:
            validate_workbench_case(case)
        destination = Path(args.out)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(canonical_json({"schema_version": "underwriting.workbench-data/v1", "cases": cases}) + b"\n")
        print(json.dumps({"status": "PRODUCED", "cases": len(cases), "output": destination.as_posix()}, sort_keys=True))
        return 0
    except (UnderwritingError, ValueError, OSError, KeyError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
