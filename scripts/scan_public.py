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
REVIEWED_TEXT_LIMITS = {"workbench/src/data/cases.json": 12 * 1024 * 1024}
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


def reviewed_demo_allowlist(root: Path) -> set[str]:
    """Allow only a manifest-bound portfolio demo binary."""

    manifest_path = root / "demo" / "release" / "manifest.json"
    if not manifest_path.exists():
        return set()
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError("demo_manifest_missing_or_symlink")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_body = dict(manifest)
    manifest_digest = manifest_body.pop("manifest_sha256", None)
    if manifest_digest != hashlib.sha256(canonical_json(manifest_body)).hexdigest():
        raise ValueError("demo_manifest_digest_mismatch")
    if (
        manifest.get("schema_version") != "underwriting.demo-manifest/v2"
        or manifest.get("status") != "RENDERED_LOCAL_FOUNDER_REVIEW_PENDING"
        or manifest.get("video") != "underwriting-intelligence-lab-demo.mp4"
    ):
        raise ValueError("demo_manifest_state_invalid")
    relative = Path("demo/release") / manifest["video"]
    video = root / relative
    if video.is_symlink() or not video.is_file():
        raise ValueError("demo_video_missing_or_symlink")
    if hashlib.sha256(video.read_bytes()).hexdigest() != manifest.get("sha256"):
        raise ValueError("demo_video_digest_mismatch")
    return {relative.as_posix()}


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


def validate_blind_review_binding(root: Path) -> None:
    """Reject a current PASS that is not bound to the retained IC snapshots."""

    result_path = root / "verification" / "blind-review-result.md"
    text = result_path.read_text(encoding="utf-8")
    state_match = re.search(r"^State: `([A-Z_]+)`$", text, flags=re.MULTILINE)
    if state_match is None:
        raise ValueError("blind_review_state_missing")
    state = state_match.group(1)
    if state == "SUPERSEDED_NOT_CURRENT":
        if "Current blind review: `NOT_RUN`" not in text:
            raise ValueError("blind_review_superseded_boundary_missing")
        return
    if state != "PASS":
        raise ValueError(f"blind_review_state_invalid:{state}")

    protocol_path = root / "verification" / "blind-review-protocol.json"
    protocol = json.loads(protocol_path.read_text(encoding="utf-8"))
    protocol_sha256 = hashlib.sha256(protocol_path.read_bytes()).hexdigest()
    protocol_match = re.search(r"^- Protocol SHA-256: `([0-9a-f]{64})`", text, flags=re.MULTILINE)
    if protocol_match is None or protocol_match.group(1) != protocol_sha256:
        raise ValueError("blind_review_protocol_digest_mismatch")

    visual_manifest = json.loads(
        (root / "verification" / "visual-evidence.json").read_text(encoding="utf-8")
    )
    visual_digests = {
        item["path"]: item["sha256"]
        for item in visual_manifest.get("files", [])
        if isinstance(item, dict) and isinstance(item.get("path"), str)
    }
    expected = {
        "AtlasGrid": visual_digests.get(
            "dist/visual-evidence/desktop-atlasgrid-systems-ic-snapshot.png"
        ),
        "Helios": visual_digests.get(
            "dist/visual-evidence/desktop-helios-compute-control-ic-snapshot.png"
        ),
    }
    for label, digest_value in expected.items():
        digest_match = re.search(
            rf"^- {label} image SHA-256: `([0-9a-f]{{64}})`",
            text,
            flags=re.MULTILINE,
        )
        if digest_value is None or digest_match is None or digest_match.group(1) != digest_value:
            raise ValueError(f"blind_review_image_digest_mismatch:{label.lower()}")

    index_path = root / "verification" / "blind-reviews" / "index.json"
    if index_path.is_symlink() or not index_path.is_file():
        raise ValueError("blind_review_index_missing_or_symlink")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    if set(index) != {"schema_version", "state", "receipts", "index_sha256"}:
        raise ValueError("blind_review_index_shape_invalid")
    index_body = dict(index)
    index_digest = index_body.pop("index_sha256")
    if index_digest != hashlib.sha256(canonical_json(index_body)).hexdigest():
        raise ValueError("blind_review_index_digest_mismatch")
    index_match = re.search(r"^- Blind-review index self-digest \(`index_sha256`\): `([0-9a-f]{64})`", text, flags=re.MULTILINE)
    if index_match is None or index_match.group(1) != index_digest:
        raise ValueError("blind_review_result_index_digest_mismatch")
    if index["schema_version"] != "underwriting.blind-review-index/v1" or index["state"] != "PASS":
        raise ValueError("blind_review_index_state_invalid")

    protocol_cases = {item["case_id"]: item for item in protocol["cases"]}
    index_entries = index["receipts"]
    if not isinstance(index_entries, list) or len(index_entries) != len(protocol_cases):
        raise ValueError("blind_review_receipt_count_mismatch")
    receipt_case_ids: set[str] = set()
    reviewer_ids: set[str] = set()
    for entry in index_entries:
        if set(entry) != {"case_id", "path", "sha256"}:
            raise ValueError("blind_review_index_entry_invalid")
        case_id = entry["case_id"]
        if case_id not in protocol_cases or case_id in receipt_case_ids:
            raise ValueError("blind_review_case_set_invalid")
        receipt_case_ids.add(case_id)
        relative = Path(entry["path"])
        if relative.is_absolute() or ".." in relative.parts or relative.parts[:2] != ("verification", "blind-reviews"):
            raise ValueError("blind_review_receipt_path_unsafe")
        receipt_path = root / relative
        if receipt_path.is_symlink() or not receipt_path.is_file():
            raise ValueError("blind_review_receipt_missing_or_symlink")
        receipt_bytes = receipt_path.read_bytes()
        if hashlib.sha256(receipt_bytes).hexdigest() != entry["sha256"]:
            raise ValueError("blind_review_receipt_file_digest_mismatch")
        receipt = json.loads(receipt_bytes)
        required = {
            "schema_version", "case_id", "reviewer_task_id", "reviewer_role",
            "recorded_at_utc", "review_context", "artifact", "image_sha256",
            "protocol_sha256", "verdict", "answers", "ambiguity",
            "writes_performed", "receipt_sha256",
        }
        if set(receipt) != required or receipt["schema_version"] != "underwriting.blind-review-receipt/v1":
            raise ValueError("blind_review_receipt_shape_invalid")
        receipt_body = dict(receipt)
        receipt_digest = receipt_body.pop("receipt_sha256")
        if receipt_digest != hashlib.sha256(canonical_json(receipt_body)).hexdigest():
            raise ValueError("blind_review_receipt_digest_mismatch")
        if receipt["case_id"] != case_id or receipt["artifact"] != protocol_cases[case_id]["artifact"]:
            raise ValueError("blind_review_receipt_case_binding_mismatch")
        if receipt["reviewer_task_id"] in reviewer_ids:
            raise ValueError("blind_review_reviewer_duplicate")
        reviewer_ids.add(receipt["reviewer_task_id"])
        if receipt["protocol_sha256"] != protocol_sha256 or receipt["verdict"] != "PASS" or receipt["writes_performed"] != 0:
            raise ValueError("blind_review_receipt_state_invalid")
        artifact_path = root / receipt["artifact"]
        artifact_digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
        if receipt["image_sha256"] != artifact_digest or visual_digests.get(receipt["artifact"]) != artifact_digest:
            raise ValueError("blind_review_receipt_image_binding_mismatch")
        answers = receipt["answers"]
        if not isinstance(answers, list) or len(answers) != len(protocol["questions"]):
            raise ValueError("blind_review_answer_count_mismatch")
        for question_index, (question, answer) in enumerate(zip(protocol["questions"], answers, strict=True), start=1):
            question_digest = hashlib.sha256(canonical_json(question)).hexdigest()
            if set(answer) != {"question_index", "question_sha256", "answer"} or answer["question_index"] != question_index or answer["question_sha256"] != question_digest or not isinstance(answer["answer"], str) or not 1 <= len(answer["answer"]) <= 2000:
                raise ValueError("blind_review_answer_binding_mismatch")
    if receipt_case_ids != set(protocol_cases):
        raise ValueError("blind_review_case_set_invalid")

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
        reviewed_binaries.update(reviewed_demo_allowlist(ROOT))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        failures.append(f"demo/release/manifest.json: {error}")
    try:
        reviewed_source_files = source_room_allowlist(ROOT)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        failures.append(f"portfolio source rooms: {error}")
        reviewed_source_files = set()
    try:
        validate_blind_review_binding(ROOT)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        failures.append(f"verification/blind-review-result.md: {error}")
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
        if len(data) > REVIEWED_TEXT_LIMITS.get(relative, MAX_FILE_BYTES):
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
