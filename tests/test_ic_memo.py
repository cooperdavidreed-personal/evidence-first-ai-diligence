from __future__ import annotations

import json
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
    assert "22.91%" in markdown
    assert "$213.9M" in markdown
    assert "Synthetic causal estimates recover planted assignment mechanisms only" in markdown
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
