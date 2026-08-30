from __future__ import annotations

from pathlib import Path

import pytest

from scripts import verify_toolkit_integration as verifier


def _artifacts(root: Path) -> None:
    for name in verifier.ARTIFACTS:
        (root / name).write_text(name)


def test_toolkit_verifier_rejects_not_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _artifacts(tmp_path)
    monkeypatch.setattr(
        verifier,
        "verify_release_bundle",
        lambda *_: {"status": "NOT_RUN", "reason": "install toolkit extra"},
    )
    with pytest.raises(RuntimeError, match="status=NOT_RUN"):
        verifier.verify(tmp_path)


def test_toolkit_verifier_requires_complete_passing_receipts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _artifacts(tmp_path)
    monkeypatch.setattr(
        verifier,
        "verify_release_bundle",
        lambda *_: {
            "status": "PASS",
            "evidence_receipts": [{}, {}, {}],
            "release_receipt": {"status": "PASS"},
        },
    )
    assert verifier.verify(tmp_path)["status"] == "PASS"


def test_toolkit_verifier_rejects_missing_candidate_artifact(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="missing artifacts"):
        verifier.verify(tmp_path)
