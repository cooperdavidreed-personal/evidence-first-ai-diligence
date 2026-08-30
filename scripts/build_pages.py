from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from ic_evidence_lab.canonical import canonical_json


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


def build(repo: Path, destination: Path, workbench_dist: Path) -> None:
    index = workbench_dist / "index.html"
    if not index.is_file():
        raise FileNotFoundError(f"missing built v2 workbench: {index}")
    if destination.exists() and any(destination.iterdir()):
        raise RuntimeError(f"pages destination must be empty: {destination}")
    destination.mkdir(parents=True, exist_ok=True)

    staged: list[tuple[Path, str]] = []
    for source in sorted(path for path in workbench_dist.rglob("*") if path.is_file()):
        relative = source.relative_to(workbench_dist)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        staged.append((target, "v2-workbench"))
    (destination / ".nojekyll").write_text("", encoding="utf-8")
    staged.append((destination / ".nojekyll", "pages-control"))

    for case in ("atlasgrid", "helios"):
        for name in ("ic-memo.html", "ic-memo.md", "model-appendix.json", "packet-receipt.json"):
            staged.append((_copy_file(repo, destination, f"portfolio/{case}/{name}"), "case-packet"))

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
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    destination = Path(args.out)
    if not destination.is_absolute():
        destination = repo / destination
    workbench_dist = Path(args.workbench_dist)
    if not workbench_dist.is_absolute():
        workbench_dist = repo / workbench_dist
    build(repo, destination, workbench_dist)
    print(json.dumps({"status": "PRODUCED", "path": str(destination)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
