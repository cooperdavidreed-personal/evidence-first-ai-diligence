from __future__ import annotations

import hashlib
from pathlib import Path

from ic_evidence_lab.canonical import canonical_json


def main() -> int:
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
        "scope": "Five views, two synthetic cases, desktop and mobile; automated serious/critical axe scan and root-overflow assertion per route; Helios IC memo full-page and five-page Letter render.",
    }
    manifest["manifest_sha256"] = hashlib.sha256(canonical_json(manifest)).hexdigest()
    output = root / "verification" / "visual-evidence.json"
    output.write_bytes(canonical_json(manifest) + b"\n")
    print(output.relative_to(root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
