from __future__ import annotations

import json
import hashlib
from pathlib import Path

import pytest

from ic_evidence_lab.canonical import canonical_json
from scripts.scan_public import reviewed_binary_allowlist, validate_blind_review_binding


ROOT = Path(__file__).parents[1]


def test_langchain_case_does_not_promote_url_only_sources() -> None:
    case_root = ROOT / "examples/langchain-public"
    sources = json.loads((case_root / "source-register.json").read_text())
    claims = json.loads((case_root / "claims.json").read_text())
    assert sources["status"] == "URL_ONLY_UNVERIFIED"
    assert all(source["retained_bytes"] is False for source in sources["sources"])
    assert all(claim["state"] in {"UNVERIFIED", "BLOCKED"} for claim in claims["claims"])
    assert any(claim["state"] == "BLOCKED" for claim in claims["claims"])
    assert "not `INVEST`" in (case_root / "memo.md").read_text()


def test_reviewed_portfolio_binaries_are_manifest_bound() -> None:
    reviewed = reviewed_binary_allowlist(ROOT)
    assert len(reviewed) == 28
    assert "dist/visual-evidence/desktop-atlasgrid-systems-lineage-drawer.png" in reviewed
    assert "dist/visual-evidence/desktop-helios-compute-control-selected-thesis-path.png" in reviewed
    assert "output/pdf/atlasgrid-ic-memo-letter.pdf" in reviewed
    assert "output/pdf/helios-ic-memo-letter.pdf" in reviewed
    assert all(
        path.startswith("dist/visual-evidence/") or path.startswith("output/pdf/")
        for path in reviewed
    )


def test_reviewed_binary_allowlist_fails_closed_on_digest_mismatch(
    tmp_path: Path,
) -> None:
    binary = tmp_path / "dist" / "visual-evidence" / "proof.png"
    binary.parent.mkdir(parents=True)
    binary.write_bytes(b"reviewed-bytes")
    manifest = {
        "schema_version": "underwriting.visual-evidence/v1",
        "files": [
            {
                "path": "dist/visual-evidence/proof.png",
                "viewport": "1x1",
                "sha256": "0" * 64,
                "bytes": len(binary.read_bytes()),
            }
        ],
        "print_files": [],
        "scope": "test",
    }
    manifest["manifest_sha256"] = hashlib.sha256(canonical_json(manifest)).hexdigest()
    manifest_path = tmp_path / "verification" / "visual-evidence.json"
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_bytes(canonical_json(manifest) + b"\n")
    with pytest.raises(ValueError, match="visual_manifest_file_digest_mismatch"):
        reviewed_binary_allowlist(tmp_path)


def test_superseded_blind_review_is_explicitly_not_current() -> None:
    validate_blind_review_binding(ROOT)


def test_current_blind_review_fails_when_snapshot_digest_is_stale(tmp_path: Path) -> None:
    verification = tmp_path / "verification"
    verification.mkdir(parents=True)
    protocol = b'{"schema_version":"test"}\n'
    (verification / "blind-review-protocol.json").write_bytes(protocol)
    (verification / "visual-evidence.json").write_text(
        json.dumps(
            {
                "files": [
                    {"path": "dist/visual-evidence/desktop-atlasgrid-systems-ic-snapshot.png", "sha256": "a" * 64},
                    {"path": "dist/visual-evidence/desktop-helios-compute-control-ic-snapshot.png", "sha256": "b" * 64},
                ]
            }
        ),
        encoding="utf-8",
    )
    (verification / "blind-review-result.md").write_text(
        "\n".join(
            [
                "State: `PASS`",
                f"- Protocol SHA-256: `{hashlib.sha256(protocol).hexdigest()}`",
                f"- AtlasGrid image SHA-256: `{'0' * 64}`",
                f"- Helios image SHA-256: `{'b' * 64}`",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="blind_review_image_digest_mismatch:atlasgrid"):
        validate_blind_review_binding(tmp_path)
