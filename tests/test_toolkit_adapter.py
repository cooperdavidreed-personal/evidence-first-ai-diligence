from __future__ import annotations

from pathlib import Path

from ic_evidence_lab.pipeline import write_outputs
from ic_evidence_lab.toolkit_adapter import EXPECTED_TOOLS, EXPECTED_VERSION, verify_packet


ROOT = Path(__file__).parents[1]


def test_expected_contract_is_exact() -> None:
    assert EXPECTED_VERSION == "0.1.1"
    assert EXPECTED_TOOLS == {
        "audit_citations",
        "audit_claims",
        "summarize_verification",
        "verify_artifact",
    }


def test_released_evidence_gate_verifies_packet_when_installed(tmp_path: Path) -> None:
    packet, _, _ = write_outputs(ROOT / "examples/vectorforge/case-after.json", tmp_path)
    result = verify_packet(tmp_path, packet.name)
    assert result["status"] in {"PASS", "NOT_RUN"}
    if result["status"] == "PASS":
        receipt = result["toolkit_receipt"]
        assert receipt["tool"] == "verify_artifact"
        assert receipt["artifact"]["sha256"]
