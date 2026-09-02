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
    views = ("overview", "financials", "diligence", "documents", "ic-memo")
    cases = ("atlasgrid", "helios", "northstar")
    files = []
    for viewport, dimensions in (("desktop", "1440x900"), ("mobile", "390x844")):
        path = evidence / f"{viewport}-deals.png"
        if not path.is_file():
            raise SystemExit(f"missing_deals_evidence:{path.name}")
        files.append(
            {
                "path": path.relative_to(root).as_posix(),
                "viewport": dimensions,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "bytes": path.stat().st_size,
            }
        )
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
        for state in ("ready", "incomplete"):
            path = evidence / f"{viewport}-northstar-package-{state}.png"
            if not path.is_file():
                raise SystemExit(f"missing_intake_evidence:{path.name}")
            files.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "viewport": dimensions,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "bytes": path.stat().st_size,
                }
            )
    accessibility_files = []
    accessibility_root = root / "verification" / "accessibility-evidence"
    for viewport in ("desktop", "mobile"):
        for surface in ("deals", "atlasgrid-product", "helios-product", "northstar-intake"):
            path = accessibility_root / f"{viewport}-{surface}.json"
            if not path.is_file():
                raise SystemExit(f"missing_accessibility_evidence:{path.name}")
            accessibility_files.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "bytes": path.stat().st_size,
                }
            )
    print_files = []
    for path, format_name in (
        (evidence / "desktop-atlasgrid-ic-snapshot.png", "one-page snapshot PNG"),
        (evidence / "desktop-atlasgrid-underwriting-packet.png", "underwriting packet PNG"),
        (evidence / "desktop-helios-ic-snapshot.png", "one-page snapshot PNG"),
        (evidence / "desktop-helios-underwriting-packet.png", "underwriting packet PNG"),
        *tuple(
            (root / "output" / "pdf" / f"{slug}-{artifact}-letter.pdf", "US Letter PDF")
            for slug in ("atlasgrid", "helios")
            for artifact in ("ic-snapshot", "underwriting-packet", "technical-appendix")
        ),
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
        "accessibility_files": accessibility_files,
        "print_files": print_files,
        "scope": "Calm deal root plus exactly five primary deal destinations for two retained synthetic cases and one browser-local supported-package case at desktop and mobile; complete and fail-closed intake states; automated critical/serious Axe scan and root-overflow assertion per tested default route; each retained case keeps a one-page snapshot, detailed underwriting packet, and technical appendix as normalized US Letter PDF proof. Observed practitioner usability remains NOT_RUN.",
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
