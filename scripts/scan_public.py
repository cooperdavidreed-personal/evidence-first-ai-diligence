#!/usr/bin/env python3
"""Fail closed when prospective public source contains private paths or secrets."""

from __future__ import annotations

import hashlib
from importlib import resources
import json
import re
import subprocess
from pathlib import Path

from ic_evidence_lab.canonical import canonical_json
from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
MAX_FILE_BYTES = 10 * 1024 * 1024
FORBIDDEN_PATH_PARTS = {"evidence", "state", ".venv", "dist", "__pycache__"}
REVIEWED_BINARY_ROOTS = {"dist/visual-evidence", "output/pdf"}
SOURCE_ROOM_ROOTS = {
    "atlasgrid": "portfolio/atlasgrid/data-room",
    "helios": "portfolio/helios/data-room",
}
PATTERNS = {
    "absolute-user-path": re.compile(rb"/(?:Users|home)/[^/\s]+/"),
    "aws-access-key": re.compile(b"AKIA" + rb"[0-9A-Z]{16}"),
    "private-key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "provider-api-key": re.compile(rb"(?:OPENAI|ANTHROPIC|XAI)_API_KEY\s*=\s*[^\s<]+"),
    "github-token": re.compile(rb"gh[pousr]_[A-Za-z0-9_]{30,}"),
    "pypi-token": re.compile(rb"pypi-[A-Za-z0-9_-]{30,}"),
}


def reviewed_binary_allowlist(root: Path) -> set[str]:
    manifest_path = root / "verification" / "visual-evidence.json"
    if not manifest_path.is_file():
        return set()
    manifest = json.loads(manifest_path.read_text())
    expected_manifest_sha256 = manifest.get("manifest_sha256")
    manifest_body = dict(manifest)
    manifest_body.pop("manifest_sha256", None)
    if expected_manifest_sha256 != hashlib.sha256(canonical_json(manifest_body)).hexdigest():
        raise ValueError("visual_manifest_digest_mismatch")
    entries = [*manifest.get("files", []), *manifest.get("print_files", [])]
    reviewed: set[str] = set()
    for entry in entries:
        relative = entry.get("path")
        expected_sha256 = entry.get("sha256")
        expected_bytes = entry.get("bytes")
        if not isinstance(relative, str) or not isinstance(expected_sha256, str):
            raise ValueError("visual_manifest_entry_invalid")
        relative_path = Path(relative)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ValueError(f"visual_manifest_path_unsafe:{relative}")
        if not any(
            relative == allowed_root or relative.startswith(f"{allowed_root}/")
            for allowed_root in REVIEWED_BINARY_ROOTS
        ):
            raise ValueError(f"visual_manifest_path_outside_review_roots:{relative}")
        if relative in reviewed:
            raise ValueError(f"visual_manifest_path_duplicate:{relative}")
        path = root / relative_path
        if not path.is_file():
            raise ValueError(f"visual_manifest_file_missing:{relative}")
        data = path.read_bytes()
        if expected_bytes != len(data):
            raise ValueError(f"visual_manifest_size_mismatch:{relative}")
        if expected_sha256 != hashlib.sha256(data).hexdigest():
            raise ValueError(f"visual_manifest_file_digest_mismatch:{relative}")
        reviewed.add(relative)
    return reviewed


def validate_source_room(root: Path, case_id: str, relative_root: str) -> set[str]:
    """Return the exact publishable inventory for one synthetic source room.

    This is the shared fail-closed boundary used by both the public scan and
    Pages staging.  It intentionally rejects symlinks and undeclared files
    before any source bytes are copied into a release artifact.
    """

    manifest_relative = f"{relative_root}/manifest.json"
    manifest_path = root / manifest_relative
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError(f"source_room_manifest_missing_or_symlink:{case_id}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    schema = json.loads(
        resources.files("underwriting_lab.schemas")
        .joinpath("dataroom-manifest.schema.json")
        .read_text(encoding="utf-8")
    )
    schema_errors = sorted(
        Draft202012Validator(schema).iter_errors(manifest),
        key=lambda error: list(error.absolute_path),
    )
    if schema_errors:
        first = schema_errors[0]
        location = "/".join(str(item) for item in first.absolute_path) or "<root>"
        raise ValueError(f"source_room_manifest_schema_invalid:{case_id}:{location}:{first.message}")
    manifest_body = dict(manifest)
    expected_manifest_sha256 = manifest_body.pop("manifest_sha256", None)
    if (
        manifest.get("schema_version") != "underwriting.dataroom-manifest/v1"
        or manifest.get("case_id") != case_id
        or manifest.get("synthetic") is not True
        or not isinstance(manifest.get("artifacts"), list)
        or expected_manifest_sha256
        != hashlib.sha256(canonical_json(manifest_body)).hexdigest()
    ):
        raise ValueError(f"source_room_manifest_invalid:{case_id}")

    reviewed = {manifest_relative}
    artifact_paths: set[str] = set()
    for artifact in manifest["artifacts"]:
        if not isinstance(artifact, dict) or not isinstance(artifact.get("path"), str):
            raise ValueError(f"source_room_artifact_entry_invalid:{case_id}")
        relative = Path(artifact["path"])
        if (
            relative.is_absolute()
            or ".." in relative.parts
            or "truth" in relative.parts
            or relative.as_posix() in artifact_paths
        ):
            raise ValueError(f"source_room_path_unsafe:{case_id}:{relative}")
        artifact_paths.add(relative.as_posix())
        public_relative = f"{relative_root}/{relative.as_posix()}"
        path = root / public_relative
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"source_room_artifact_missing_or_symlink:{public_relative}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != artifact.get("sha256"):
            raise ValueError(f"source_room_artifact_mismatch:{public_relative}")
        reviewed.add(public_relative)

    room_path = root / relative_root
    observed = {
        path.relative_to(root).as_posix()
        for path in room_path.rglob("*")
        if path.is_file() or path.is_symlink()
    }
    if observed != reviewed:
        extras = sorted(observed - reviewed)
        missing = sorted(reviewed - observed)
        raise ValueError(
            f"source_room_inventory_mismatch:{case_id}:extra={extras}:missing={missing}"
        )
    return reviewed


def source_room_allowlist(root: Path) -> set[str]:
    reviewed: set[str] = set()
    for case_id, relative_root in SOURCE_ROOM_ROOTS.items():
        reviewed.update(validate_source_room(root, case_id, relative_root))
    return reviewed


def main() -> int:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    files = [item for item in result.stdout.split(b"\0") if item]
    if not files:
        raise SystemExit("public scan FAIL: git returned no candidate files")
    failures: list[str] = []
    try:
        reviewed_binaries = reviewed_binary_allowlist(ROOT)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        failures.append(f"verification/visual-evidence.json: {error}")
        reviewed_binaries = set()
    try:
        reviewed_source_files = source_room_allowlist(ROOT)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        failures.append(f"portfolio source rooms: {error}")
        reviewed_source_files = set()
    for raw in files:
        relative = raw.decode("utf-8", errors="strict")
        path = ROOT / relative
        if not path.exists():
            # A tracked path deleted in the working tree is not part of the candidate tree.
            continue
        if relative not in reviewed_binaries and FORBIDDEN_PATH_PARTS.intersection(
            Path(relative).parts
        ):
            failures.append(f"{relative}: private or generated path")
            continue
        if any(
            relative == room_root or relative.startswith(f"{room_root}/")
            for room_root in SOURCE_ROOM_ROOTS.values()
        ) and relative not in reviewed_source_files:
            failures.append(f"{relative}: undeclared source-room file")
            continue
        if path.is_symlink():
            failures.append(f"{relative}: symlink is not allowed")
            continue
        data = path.read_bytes()
        if relative in reviewed_binaries:
            continue
        if len(data) > MAX_FILE_BYTES:
            failures.append(f"{relative}: file exceeds scan limit")
            continue
        if b"\0" in data[:8192]:
            failures.append(f"{relative}: binary file requires explicit review")
            continue
        for name, pattern in PATTERNS.items():
            if pattern.search(data):
                failures.append(f"{relative}: {name}")
    if failures:
        raise SystemExit("public scan FAIL:\n" + "\n".join(failures))
    print(f"public-scan=PASS candidate_files={len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
