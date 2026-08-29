from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

from underwriting_lab.analysis import analyze_room
from underwriting_lab.contracts import digest, sha256_file
from underwriting_lab.generator import generate_room
from underwriting_lab.memo import build_ic_packet_from_case


def test_ic_packet_reconciles_to_the_same_case_receipts(tmp_path: Path) -> None:
    room = tmp_path / "atlasgrid"
    manifest = generate_room("atlasgrid", 20260828, room)
    analysis_path = analyze_room(manifest, room / "analysis.json")
    case = json.loads(analysis_path.read_text(encoding="utf-8"))
    artifacts = build_ic_packet_from_case(case, tmp_path / "packet")
    packet = json.loads(artifacts["appendix"].read_text(encoding="utf-8"))
    packet_body = dict(packet)
    packet_digest = packet_body.pop("packet_sha256")
    assert packet_digest == digest(packet_body)
    assert packet["analysis_sha256"] == case["analysis_sha256"]
    assert packet["maximum_bid_cents"] == case["peEngine"]["maximum_bid_cents"]
    for scenario in ("ask", "selected", "downside"):
        assert packet["scenarios"][scenario]["gross_xirr"] == case["peEngine"][scenario]["gross_xirr"]
        assert packet["scenarios"][scenario]["gross_moic"] == case["peEngine"][scenario]["gross_moic"]
        assert packet["scenarios"][scenario]["ending_debt_cents"] == case["peEngine"][scenario]["debt_schedule"]["ending_debt_cents"]
        assert packet["scenarios"][scenario]["result_receipt_sha256"] == case["peEngine"][scenario]["receipt_sha256"]
    assert packet["value_creation_bridge"]["receipt_sha256"] == case["valueCreationBridge"]["receipt_sha256"]

    receipt = json.loads(artifacts["receipt"].read_text(encoding="utf-8"))
    receipt_body = dict(receipt)
    receipt_digest = receipt_body.pop("receipt_sha256")
    assert receipt_digest == digest(receipt_body)
    for name, path in (("ic-memo.md", artifacts["memo"]), ("ic-memo.html", artifacts["html"]), ("model-appendix.json", artifacts["appendix"])):
        assert receipt["artifacts"][name] == sha256_file(path)

    markdown = artifacts["memo"].read_text(encoding="utf-8")
    assert "`REPRICE`" in markdown
    assert "22.57%" in markdown
    assert "$212.4M" in markdown
    assert "Synthetic causal estimates recover planted assignment mechanisms only" in markdown
    for section in [
        "## Operating case and valuation bridge",
        "## Leverage, liquidity, and covenant workpaper",
        "## Sensitivity and distributional downside",
        "### Risk, mitigant, owner, and consequence",
        "## Value creation",
        "## Receipt appendix",
    ]:
        assert section in markdown
    assert "Probability below 1.0x MOIC" in markdown
    assert "Probability of a modeled covenant breach" in markdown
    html = artifacts["html"].read_text(encoding="utf-8")
    assert "@page{size:letter" in html
    assert packet_digest in html


def test_ic_packet_is_byte_deterministic(tmp_path: Path) -> None:
    room = tmp_path / "atlasgrid"
    manifest = generate_room("atlasgrid", 20260828, room)
    analysis_path = analyze_room(manifest, room / "analysis.json")
    case = json.loads(analysis_path.read_text(encoding="utf-8"))
    first = build_ic_packet_from_case(case, tmp_path / "first")
    second = build_ic_packet_from_case(case, tmp_path / "second")
    for key in first:
        assert first[key].read_bytes() == second[key].read_bytes()


def test_ic_packet_fails_closed_on_failed_diagnostic(tmp_path: Path) -> None:
    room = tmp_path / "atlasgrid"
    manifest = generate_room("atlasgrid", 20260828, room)
    analysis_path = analyze_room(manifest, room / "analysis.json")
    case = json.loads(analysis_path.read_text(encoding="utf-8"))
    tampered = deepcopy(case)
    ag10 = next(item for item in tampered["analyses"] if item["analysis_id"] == "AG-10")
    diagnostic = next(item for item in ag10["diagnostics"] if item["name"] == "xirr_npv_residual")
    diagnostic["status"] = "FAIL"
    ag10.pop("receipt_sha256")
    ag10["receipt_sha256"] = digest(ag10)
    tampered.pop("analysis_sha256")
    tampered["analysis_sha256"] = digest(tampered)
    try:
        build_ic_packet_from_case(tampered, tmp_path / "blocked")
    except ValueError as exc:
        assert "ic_packet_blocked_failed_diagnostic:AG-10:xirr_npv_residual" in str(exc)
    else:  # pragma: no cover - fail-closed assertion
        raise AssertionError("memo generation accepted a failed diagnostic")
