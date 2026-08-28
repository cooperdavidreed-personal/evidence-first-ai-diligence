from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from ic_evidence_lab.pipeline import write_outputs
from ic_evidence_lab.toolkit_adapter import (
    EXPECTED_EVIDENCE_TOOLS,
    EXPECTED_RELEASE_TOOLS,
    EXPECTED_VERSION,
    verify_packet,
    verify_release_bundle,
)


ROOT = Path(__file__).parents[1]


def test_expected_contract_is_exact() -> None:
    assert EXPECTED_VERSION == "0.1.1"
    assert EXPECTED_EVIDENCE_TOOLS == {
        "audit_citations",
        "audit_claims",
        "summarize_verification",
        "verify_artifact",
    }
    assert EXPECTED_RELEASE_TOOLS == {
        "build_release_receipt",
        "check_contract",
        "evaluate_completion",
        "format_blockers",
    }


def test_released_evidence_gate_verifies_packet_when_installed(tmp_path: Path) -> None:
    packet, _, _ = write_outputs(ROOT / "examples/vectorforge/case-after.json", tmp_path)
    result = verify_packet(tmp_path, packet.name)
    try:
        installed = version("dailyaiagents-evidence-gate") == EXPECTED_VERSION
    except PackageNotFoundError:
        installed = False
    assert result["status"] == ("PASS" if installed else "NOT_RUN")
    if installed:
        receipt = result["toolkit_receipt"]
        assert receipt["tool"] == "verify_artifact"
        assert receipt["artifact"]["sha256"]


def test_both_released_gates_verify_bundle_when_installed(tmp_path: Path) -> None:
    packet, receipt, memo = write_outputs(ROOT / "examples/vectorforge/case-after.json", tmp_path)
    result = verify_release_bundle(tmp_path, [packet.name, receipt.name, memo.name])
    try:
        installed = (
            version("dailyaiagents-evidence-gate") == EXPECTED_VERSION
            and version("dailyaiagents-release-gate") == EXPECTED_VERSION
        )
    except PackageNotFoundError:
        installed = False
    assert result["status"] == ("PASS" if installed else "NOT_RUN")
    if installed:
        assert len(result["evidence_receipts"]) == 3
        assert result["release_receipt"]["tool"] == "build_release_receipt"
