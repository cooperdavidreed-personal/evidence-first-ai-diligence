from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from html import escape
from pathlib import Path
from urllib.parse import urlparse

from ic_evidence_lab.canonical import canonical_json
try:
    from scripts.scan_public import validate_source_room
except ModuleNotFoundError:  # Direct script execution sets sys.path[0] to scripts/.
    from scan_public import validate_source_room


def _copy_file(repo: Path, destination: Path, relative: str) -> Path:
    relative_path = Path(relative)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise ValueError(f"unsafe candidate artifact path: {relative}")
    source = repo / relative_path
    if not source.is_file():
        raise FileNotFoundError(f"missing candidate artifact: {relative}")
    target = destination / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    return target


def _manifest_entry(destination: Path, path: Path, role: str) -> dict[str, object]:
    data = path.read_bytes()
    return {
        "bytes": len(data),
        "path": path.relative_to(destination).as_posix(),
        "role": role,
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def build(
    repo: Path,
    destination: Path,
    workbench_dist: Path,
    *,
    include_demo: bool = False,
    canonical_url: str | None = None,
) -> None:
    if destination.exists() and any(destination.iterdir()):
        raise RuntimeError(f"pages destination must be empty: {destination}")
    destination.mkdir(parents=True, exist_ok=True)

    staged: list[tuple[Path, str]] = []
    if canonical_url is None:
        index = workbench_dist / "index.html"
        if not index.is_file():
            raise FileNotFoundError(f"missing built workbench: {index}")
        for source in sorted(path for path in workbench_dist.rglob("*") if path.is_file()):
            relative = source.relative_to(workbench_dist)
            if relative.parts[:1] == ("source-pack",):
                continue
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            staged.append((target, "legacy-workbench"))
    else:
        parsed = urlparse(canonical_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("canonical redirect URL must be an absolute HTTPS URL")
        safe_url = escape(canonical_url, quote=True)
        redirect = (
            "<!doctype html><html lang=en><head><meta charset=utf-8>"
            "<meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<meta http-equiv=refresh content='0;url={safe_url}'>"
            f"<link rel=canonical href='{safe_url}'><title>Underwriting Desk</title></head>"
            f"<body><main><h1>Underwriting Desk has moved</h1><p><a href='{safe_url}'>Open the canonical application</a>.</p></main></body></html>"
        )
        redirect_path = destination / "index.html"
        redirect_path.write_text(redirect, encoding="utf-8")
        staged.append((redirect_path, "canonical-redirect"))
    (destination / ".nojekyll").write_text("", encoding="utf-8")
    staged.append((destination / ".nojekyll", "pages-control"))

    for case in ("atlasgrid", "helios"):
        for name in ("ic-snapshot.html", "ic-snapshot.md", "underwriting-packet.html", "underwriting-packet.md", "technical-appendix.html", "technical-appendix.md", "model-appendix.json", "packet-receipt.json"):
            staged.append((_copy_file(repo, destination, f"portfolio/{case}/{name}"), "case-packet"))
        room_relative = f"portfolio/{case}/data-room"
        validate_source_room(repo, case, room_relative)
        source_manifest_path = repo / room_relative / "manifest.json"
        source_manifest = json.loads(source_manifest_path.read_text(encoding="utf-8"))
        source_files = [("manifest.json", None), *[(item["path"], item["sha256"]) for item in source_manifest["artifacts"]]]
        for relative, expected_sha256 in source_files:
            relative_path = Path(relative)
            if relative_path.is_absolute() or ".." in relative_path.parts or "truth" in relative_path.parts:
                raise RuntimeError(f"source room contains unsafe path: {relative}")
            source_relative = f"portfolio/{case}/data-room/{relative}"
            target_relative = f"source-pack/{case}/{relative}"
            source = repo / source_relative
            if not source.is_file():
                raise FileNotFoundError(f"missing source room artifact: {source_relative}")
            if expected_sha256 is not None and hashlib.sha256(source.read_bytes()).hexdigest() != expected_sha256:
                raise RuntimeError(f"source room digest mismatch: {source_relative}")
            target = destination / target_relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            staged.append((target, "synthetic-data-room"))

    if include_demo:
        demo_root = repo / "demo" / "release-fix"
        for name in (
            "underwriting-lab-demo-1080p.mp4",
            "captions.srt",
            "captions.vtt",
            "transcript.txt",
            "thumbnail-1280x720.png",
            "manifest.json",
            "review-findings.json",
        ):
            source = demo_root / name
            if not source.is_file():
                raise FileNotFoundError(
                    f"missing release demo artifact: demo/release-fix/{name}"
                )
            target = destination / "demo" / "release-fix" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            staged.append((target, "release-demo"))

    visual_manifest_path = repo / "verification/visual-evidence.json"
    visual_manifest = json.loads(visual_manifest_path.read_text(encoding="utf-8"))
    expected_manifest_sha256 = visual_manifest.get("manifest_sha256")
    manifest_body = dict(visual_manifest)
    manifest_body.pop("manifest_sha256", None)
    if expected_manifest_sha256 != hashlib.sha256(canonical_json(manifest_body)).hexdigest():
        raise RuntimeError("visual manifest digest mismatch")
    staged.append(
        (_copy_file(repo, destination, "verification/visual-evidence.json"), "visual-manifest")
    )
    accessibility_entries = visual_manifest.get("accessibility_files")
    if accessibility_entries is None:
        accessibility_root = repo / "verification" / "accessibility-evidence"
        accessibility_entries = [
            {"path": source.relative_to(repo).as_posix()}
            for source in sorted(accessibility_root.glob("*.json"))
        ]
        if len(accessibility_entries) != 4:
            raise RuntimeError(
                f"expected four legacy accessibility evidence files, got {len(accessibility_entries)}"
            )
    if not isinstance(accessibility_entries, list) or not accessibility_entries:
        raise RuntimeError("visual manifest contains no accessibility evidence")
    for entry in accessibility_entries:
        relative = entry.get("path")
        if not isinstance(relative, str) or not relative.startswith("verification/accessibility-evidence/"):
            raise RuntimeError("visual manifest contains an invalid accessibility path")
        path = _copy_file(repo, destination, relative)
        data = path.read_bytes()
        if "bytes" in entry and (
            len(data) != entry.get("bytes")
            or hashlib.sha256(data).hexdigest() != entry.get("sha256")
        ):
            raise RuntimeError(f"visual manifest mismatch: {relative}")
        staged.append((path, "accessibility-evidence"))
    visual_entries = [*visual_manifest.get("files", []), *visual_manifest.get("print_files", [])]
    if not visual_entries:
        raise RuntimeError("visual manifest contains no candidate artifacts")
    for entry in visual_entries:
        relative = entry.get("path")
        if not isinstance(relative, str):
            raise RuntimeError("visual manifest contains an invalid path")
        path = _copy_file(repo, destination, relative)
        data = path.read_bytes()
        if len(data) != entry.get("bytes") or hashlib.sha256(data).hexdigest() != entry.get("sha256"):
            raise RuntimeError(f"visual manifest mismatch: {relative}")
        staged.append((path, "visual-evidence" if path.suffix == ".png" else "print-pdf"))

    release_manifest = {
        "artifacts": [
            _manifest_entry(destination, path, role)
            for path, role in sorted(staged, key=lambda item: item[0].relative_to(destination).as_posix())
        ],
        "boundary": (
            "Synthetic local portfolio evidence; not investment advice, real-world accuracy, "
            "hosted availability, or autonomous investment judgment."
        ),
        "schema_version": "underwriting.portfolio-candidate/v2",
    }
    release_manifest["manifest_sha256"] = hashlib.sha256(canonical_json(release_manifest)).hexdigest()
    (destination / "candidate-artifacts.json").write_bytes(canonical_json(release_manifest) + b"\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="dist/pages")
    parser.add_argument("--workbench-dist", default="workbench/dist")
    parser.add_argument(
        "--canonical-url",
        default="https://underwriting-desk-delta.vercel.app/",
        help="Replace the Pages root with a safe redirect while retaining release artifacts.",
    )
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    destination = Path(args.out)
    if not destination.is_absolute():
        destination = repo / destination
    workbench_dist = Path(args.workbench_dist)
    if not workbench_dist.is_absolute():
        workbench_dist = repo / workbench_dist
    build(
        repo,
        destination,
        workbench_dist,
        include_demo=True,
        canonical_url=args.canonical_url,
    )
    print(json.dumps({"status": "PRODUCED", "path": str(destination)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
