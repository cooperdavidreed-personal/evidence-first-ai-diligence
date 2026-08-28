from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

from ic_evidence_lab.canonical import canonical_json
from ic_evidence_lab.pipeline import (
    CaseError,
    MAX_CASE_DOCUMENT_BYTES,
    migrate_case_v1_to_v2,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migrate an IC Evidence Lab case from v1 to v2"
    )
    parser.add_argument("case", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--as-of-instant",
        required=True,
        help="confirmed RFC 3339 cutoff on the v1 as_of date",
    )
    parser.add_argument(
        "--published-at",
        action="append",
        default=[],
        metavar="SOURCE_ID=RFC3339",
        help="confirmed publication instant; repeat once for every source",
    )
    args = parser.parse_args()
    source = args.case.resolve(strict=True)
    destination = args.out.resolve()
    if destination == source:
        parser.error(
            "--out must differ from the input; in-place migration is intentionally unsupported"
        )
    published_at: dict[str, str] = {}
    for value in args.published_at:
        source_id, separator, instant = value.partition("=")
        if not separator or not source_id or not instant or source_id in published_at:
            parser.error("each --published-at must be a unique SOURCE_ID=RFC3339 pair")
        published_at[source_id] = instant
    if source.stat().st_size > MAX_CASE_DOCUMENT_BYTES:
        parser.error("input case exceeds the migration document limit")

    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise CaseError(f"duplicate_json_key:{key}")
            result[key] = value
        return result

    case = json.loads(
        source.read_text(encoding="utf-8"),
        object_pairs_hook=reject_duplicates,
        parse_constant=lambda value: (_ for _ in ()).throw(
            CaseError(f"nonstandard_json_constant:{value}")
        ),
    )
    migrated = migrate_case_v1_to_v2(
        case,
        source.parent,
        as_of_instant=args.as_of_instant,
        published_at_instants=published_at,
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(canonical_json(migrated) + b"\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
