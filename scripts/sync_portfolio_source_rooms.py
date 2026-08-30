#!/usr/bin/env python3
"""Verify tracked synthetic rooms and stage an ignored browser-serving mirror."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _safe_relative(value: str) -> Path:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts or "truth" in relative.parts:
        raise ValueError(f"source_room_path_unsafe:{value}")
    return relative


def _expected(manifest_path: Path) -> tuple[Path, dict[Path, str]]:
    room = manifest_path.resolve(strict=True).parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("synthetic") is not True:
        raise ValueError("source_room_not_synthetic")
    files = {Path("manifest.json"): _sha256(manifest_path)}
    for artifact in manifest["artifacts"]:
        relative = _safe_relative(artifact["path"])
        source = (room / relative).resolve(strict=True)
        if room not in source.parents or _sha256(source) != artifact["sha256"]:
            raise ValueError(f"source_room_artifact_mismatch:{relative.as_posix()}")
        files[relative] = artifact["sha256"]
    return room, files


def _declared_files(root: Path) -> set[Path]:
    if not root.exists():
        return set()
    return {path.relative_to(root) for path in root.rglob("*") if path.is_file()}


def _copy_exact(source_root: Path, destination: Path, files: dict[Path, str]) -> None:
    undeclared = _declared_files(destination) - set(files)
    if undeclared:
        raise ValueError(
            "source_room_undeclared_file:"
            + ",".join(path.as_posix() for path in sorted(undeclared))
        )
    for relative, expected_sha256 in files.items():
        source = source_root / relative
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        if _sha256(target) != expected_sha256:
            raise ValueError(f"source_room_copy_mismatch:{relative.as_posix()}")


def verify_or_update(
    manifest_path: Path,
    canonical: Path,
    mirror: Path,
    *,
    update: bool,
) -> dict[str, object]:
    source_root, files = _expected(manifest_path)
    if update:
        _copy_exact(source_root, canonical, files)
    else:
        observed = _declared_files(canonical)
        if observed != set(files):
            raise ValueError("source_room_file_inventory_mismatch")
        for relative, expected_sha256 in files.items():
            if _sha256(canonical / relative) != expected_sha256:
                raise ValueError(f"source_room_digest_mismatch:{relative.as_posix()}")
    _copy_exact(canonical, mirror, files)
    return {
        "bytes": sum((canonical / relative).stat().st_size for relative in files),
        "files": len(files),
        "status": "PASS",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", required=True, choices=["atlasgrid", "helios"])
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--update", action="store_true")
    args = parser.parse_args()
    result = verify_or_update(
        Path(args.manifest),
        ROOT / "portfolio" / args.case / "data-room",
        ROOT / "workbench" / "public" / "source-pack" / args.case,
        update=args.update,
    )
    print(json.dumps({"case": args.case, **result}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
