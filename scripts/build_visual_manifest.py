from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from ic_evidence_lab.canonical import canonical_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--update",
        action="store_true",
        help="Replace the retained manifest after intentional, reviewed baseline changes.",
    )
    args = parser.parse_args()
    root = Path(__file__).parents[1]
    evidence = root / "dist" / "visual-evidence"
    views = ("ic-snapshot", "thesis-and-evidence", "econometric-lab", "underwriting-room", "value-creation")
    cases = ("atlasgrid-systems", "helios-compute-control")
    files = []
    for viewport, dimensions in (("desktop", "1440x900"), ("mobile", "390x844")):
        for case in cases:
            for view in views:
                path = evidence / f"{viewport}-{case}-{view}.png"
                if not path.is_file():
                    raise SystemExit(f"missing_visual_evidence:{path.name}")
                files.append(
                    {
                        "path": path.relative_to(root).as_posix(),
                        "viewport": dimensions,
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                        "bytes": path.stat().st_size,
                    }
                )
    print_files = []
    for path, format_name in (
        (evidence / "desktop-atlasgrid-ic-memo.png", "full-page PNG"),
        (root / "output" / "pdf" / "atlasgrid-ic-memo-letter.pdf", "US Letter PDF"),
        (evidence / "desktop-helios-ic-memo.png", "full-page PNG"),
        (root / "output" / "pdf" / "helios-ic-memo-letter.pdf", "US Letter PDF"),
    ):
        if not path.is_file():
            raise SystemExit(f"missing_print_evidence:{path.name}")
        print_files.append(
            {
                "path": path.relative_to(root).as_posix(),
                "format": format_name,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "bytes": path.stat().st_size,
            }
        )
    manifest = {
        "schema_version": "underwriting.visual-evidence/v1",
        "files": files,
        "print_files": print_files,
        "scope": "Five views, two synthetic cases, desktop and mobile; automated serious/critical axe scan and root-overflow assertion per route; AtlasGrid and Helios IC memos retained as full-page PNG and normalized US Letter PDF proofs.",
    }
    manifest["manifest_sha256"] = hashlib.sha256(canonical_json(manifest)).hexdigest()
    output = root / "verification" / "visual-evidence.json"
    rendered = canonical_json(manifest) + b"\n"
    if args.update:
        output.write_bytes(rendered)
        print(f"visual-manifest=UPDATED path={output.relative_to(root)}")
    else:
        if not output.is_file():
            raise SystemExit("visual-manifest FAIL: retained manifest is missing")
        if output.read_bytes() != rendered:
            raise SystemExit("visual-manifest FAIL: retained manifest does not match artifacts")
        print(f"visual-manifest=PASS path={output.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
