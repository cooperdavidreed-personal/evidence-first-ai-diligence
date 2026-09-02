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
    repeated = build_ic_packet_from_case(case, tmp_path / "packet-repeat")
    for artifact_name in artifacts:
        assert (
            artifacts[artifact_name].read_bytes()
            == repeated[artifact_name].read_bytes()
        )
    packet = json.loads(artifacts["appendix"].read_text(encoding="utf-8"))
    packet_body = dict(packet)
    packet_digest = packet_body.pop("packet_sha256")
    assert packet_digest == digest(packet_body)
    assert packet["analysis_sha256"] == case["analysis_sha256"]
    if "vcEngine" in case and "risk_policy" in case["vcEngine"]:
        assert packet["risk_policy"] == case["vcEngine"]["risk_policy"]
        assert packet["desk_policy"] == case["vcEngine"]["desk_policy"]
        assert packet["risk_sensitivity"] == case["vcEngine"]["risk_sensitivity"]
    assert packet["maximum_bid_cents"] == case["peEngine"]["maximum_bid_cents"]
    for scenario in ("ask", "selected", "downside"):
        assert (
            packet["scenarios"][scenario]["gross_xirr"]
            == case["peEngine"][scenario]["gross_xirr"]
        )
        assert (
            packet["scenarios"][scenario]["gross_moic"]
            == case["peEngine"][scenario]["gross_moic"]
        )
        assert (
            packet["scenarios"][scenario]["ending_debt_cents"]
            == case["peEngine"][scenario]["debt_schedule"]["ending_debt_cents"]
        )
        assert (
            packet["scenarios"][scenario]["result_receipt_sha256"]
            == case["peEngine"][scenario]["receipt_sha256"]
        )
    assert (
        packet["value_creation_bridge"]["receipt_sha256"]
        == case["valueCreationBridge"]["receipt_sha256"]
    )

    receipt = json.loads(artifacts["receipt"].read_text(encoding="utf-8"))
    receipt_body = dict(receipt)
    receipt_digest = receipt_body.pop("receipt_sha256")
    assert receipt_digest == digest(receipt_body)
    for name, path in (
        ("ic-snapshot.md", artifacts["snapshot_markdown"]),
        ("ic-snapshot.html", artifacts["snapshot_html"]),
        ("underwriting-packet.md", artifacts["packet_markdown"]),
        ("underwriting-packet.html", artifacts["packet_html"]),
        ("technical-appendix.md", artifacts["technical_markdown"]),
        ("technical-appendix.html", artifacts["technical_html"]),
        ("model-appendix.json", artifacts["appendix"]),
    ):
        assert receipt["artifacts"][name] == sha256_file(path)

    markdown = artifacts["packet_markdown"].read_text(encoding="utf-8")
    assert "**Provisional posture:** **REPRICE**" in markdown
    assert "23.3%" in markdown
    assert "$215.4M" in markdown
    assert (
        "Synthetic causal estimates recover planted assignment mechanisms only"
        in markdown
    )
    for section in [
        "## Operating case and valuation bridge",
        "## Leverage, liquidity, and covenant workpaper",
        "## Sensitivity and distributional downside",
        "### Risk, mitigant, owner, and consequence",
        "### Team judgment - synthetic room only",
        "## Value creation",
        "### Ownership cadence and board control",
    ]:
        assert section in markdown
    assert "## Receipt appendix" not in markdown
    assert "## Evidence-to-model credit" not in markdown
    assert "Probability below 1.0x MOIC" in markdown
    assert "Probability of a modeled covenant breach" in markdown
    assert "≈$33-$99M illustrative 50-150% range" in markdown
    assert "Of the standalone value, **$66.2M**" not in markdown
    assert "Monte Carlo SE" not in markdown
    assert "Confirm lender EBITDA and covenant definitions" in markdown
    assert "PRE_DEBT_COMMITMENT" not in markdown
    assert "{'request_id'" not in markdown
    assert not set("—–‑−").intersection(markdown)
    for phase in ("Pre-close", "Day 1", "Day 30", "Day 100", "Year 1"):
        assert f"| {phase} |" in markdown
    snapshot = artifacts["snapshot_markdown"].read_text(encoding="utf-8")
    assert "# AtlasGrid Systems - IC decision brief" in snapshot
    assert "**Decision requested:**" in snapshot
    assert "## Evidence that changes the call" in snapshot
    assert "## What must be true" in snapshot
    assert "Requires investment committee approval" in snapshot
    assert "SHA-256" not in snapshot
    technical = artifacts["technical_markdown"].read_text(encoding="utf-8")
    assert "## Formula register" in technical
    assert technical.count("Monte Carlo SE") >= 3
    assert "## Evidence-to-model mappings" in technical
    html = artifacts["packet_html"].read_text(encoding="utf-8")
    assert "@page{size:letter" in html
    assert packet_digest in html
    snapshot_html = artifacts["snapshot_html"].read_text(encoding="utf-8")
    assert "data-decision-brief" in snapshot_html
    assert snapshot_html.count("data-visual=") == 2
    assert "Price discipline changes the answer" in snapshot_html
    assert "The underwriting reset" in snapshot_html
    assert "22% hurdle" in snapshot_html
    assert packet_digest not in snapshot_html


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
    diagnostic = next(
        item for item in ag10["diagnostics"] if item["name"] == "xirr_npv_residual"
    )
    diagnostic["status"] = "FAIL"
    prior_receipt = ag10.pop("receipt_sha256")
    ag10["receipt_sha256"] = digest(ag10)
    for metric in tampered["metricRegistry"]:
        if metric["governing_receipt_sha256"] != prior_receipt:
            continue
        metric["governing_receipt_sha256"] = ag10["receipt_sha256"]
        metric.pop("metric_sha256")
        metric["metric_sha256"] = digest(metric)
    tampered.pop("analysis_sha256")
    tampered["analysis_sha256"] = digest(tampered)
    try:
        build_ic_packet_from_case(tampered, tmp_path / "blocked")
    except ValueError as exc:
        assert "ic_packet_blocked_failed_diagnostic:AG-10:xirr_npv_residual" in str(exc)
    else:  # pragma: no cover - fail-closed assertion
        raise AssertionError("memo generation accepted a failed diagnostic")


def test_helios_ic_packet_reconciles_engine_terms_and_receipts(tmp_path: Path) -> None:
    room = tmp_path / "helios"
    manifest = generate_room("helios", 20260829, room)
    analysis_path = analyze_room(manifest, room / "analysis.json")
    case = json.loads(analysis_path.read_text(encoding="utf-8"))
    artifacts = build_ic_packet_from_case(case, tmp_path / "packet")
    repeated = build_ic_packet_from_case(case, tmp_path / "packet-repeat")
    for artifact_name in artifacts:
        assert (
            artifacts[artifact_name].read_bytes()
            == repeated[artifact_name].read_bytes()
        )
    markdown = artifacts["packet_markdown"].read_text(encoding="utf-8")
    assert "Reconcile executed financing terms" in markdown
    assert "PRE_SIGNING" not in markdown
    assert "{'request_id'" not in markdown
    assert not set("—–‑−").intersection(markdown)
    packet = json.loads(artifacts["appendix"].read_text(encoding="utf-8"))
    body = dict(packet)
    expected = body.pop("packet_sha256")
    assert expected == digest(body)
    assert packet["analysis_sha256"] == case["analysis_sha256"]
    for key in ("base", "milestone", "downside", "financing_shortfall"):
        assert (
            packet["scenarios"][key]["receipt_sha256"]
            == case["vcEngine"][key]["receipt_sha256"]
        )
        assert (
            packet["scenarios"][key]["gross_xirr"]
            == case["vcEngine"][key]["gross_xirr"]
        )
    markdown = artifacts["packet_markdown"].read_text(encoding="utf-8")
    for section in (
        "## Recommendation and executable terms",
        "## Product, market, customers, competition, and business model",
        "## Cap table and financing-event bridge",
        "## Milestone financing and monthly runway",
        "## Preference waterfall and investor return bridge",
        "## Value creation and board cadence",
    ):
        assert section in markdown
    assert "## Econometric credit and zero-credit map" not in markdown
    assert "## Receipt appendix" not in markdown
    assert "### Economic mapping register" not in markdown
    assert "**Current decision:** HOLD - LOSS HURDLE NOT MET." in markdown
    assert "Selected milestone returns" in markdown
    assert "**Binding loss hurdle:** 20.0%" in markdown
    assert "status Misses" in markdown
    assert "fully granted common at exit" in markdown
    assert "Unissued pool shares receive zero proceeds" not in markdown
    assert "Monte Carlo SE" not in markdown
    assert "gross XIRR" in markdown
    snapshot = artifacts["snapshot_markdown"].read_text(encoding="utf-8")
    assert "## HOLD" in snapshot
    assert "selected unreviewed synthetic catastrophe prior is 20.00%" in snapshot
    assert "10.00% Desk loss ceiling" in snapshot
    assert "seeded replay frequency of 20.00% is a generator check" in snapshot
    assert "SHA-256" not in snapshot
    snapshot_html = artifacts["snapshot_html"].read_text(encoding="utf-8")
    assert snapshot_html.count("data-visual=") == 2
    assert "The selected prior exceeds the Desk ceiling" in snapshot_html
    assert "the replay checks the generator rather than estimating the input" in snapshot_html
    assert "not approval" in snapshot_html
    technical = artifacts["technical_markdown"].read_text(encoding="utf-8")
    assert "Monte Carlo SE" in technical
    if "risk_policy" in case["vcEngine"]:
        assert "Desk-owned draft loss maximum" in snapshot_html
        assert "DRAFT" in snapshot_html
    technical = artifacts["technical_markdown"].read_text(encoding="utf-8")
    assert "HX-09" in technical
    assert "## Formula register" in technical
    receipt = json.loads(artifacts["receipt"].read_text(encoding="utf-8"))
    for name, path in (
        ("ic-snapshot.md", artifacts["snapshot_markdown"]),
        ("ic-snapshot.html", artifacts["snapshot_html"]),
        ("underwriting-packet.md", artifacts["packet_markdown"]),
        ("underwriting-packet.html", artifacts["packet_html"]),
        ("technical-appendix.md", artifacts["technical_markdown"]),
        ("technical-appendix.html", artifacts["technical_html"]),
        ("model-appendix.json", artifacts["appendix"]),
    ):
        assert receipt["artifacts"][name] == sha256_file(path)
