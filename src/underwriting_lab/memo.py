from __future__ import annotations

from html import escape
import json
from decimal import Decimal
from pathlib import Path
import re
from typing import Any

from .contracts import digest, sha256_file, validate_workbench_case, write_json


def _money(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    amount = abs(cents)
    if amount >= 100_000_000:
        return f"{sign}${amount / 100_000_000:,.1f}M".replace(".0M", "M")
    return f"{sign}${amount / 100:,.0f}"


def _percent(decimal: str) -> str:
    return f"{Decimal(decimal) * 100:.2f}%"


def _multiple(decimal: str) -> str:
    return f"{Decimal(decimal):.2f}x"


def _packet(case: dict[str, Any]) -> dict[str, Any]:
    engine = case["peEngine"]
    bridge = case["valueCreationBridge"]
    body: dict[str, Any] = {
        "schema_version": "underwriting.ic-packet/v2",
        "case_id": case["caseId"],
        "company": case["company"],
        "disclosure": case["disclosure"],
        "manifest_sha256": case["manifest_sha256"],
        "analysis_sha256": case["analysis_sha256"],
        "decision": case["decision"],
        "summary_metrics": case["summaryMetrics"],
        "thesis": case["thesis"],
        "team_assessment": case["teamAssessment"],
        "ownership_cadence": case["ownershipCadence"],
        "evidence_mappings": case["evidenceMappings"],
        "scenarios": {
            key: {
                "scenario_id": engine[key]["scenario_id"],
                "engine_inputs_sha256": engine[key]["engine_inputs_sha256"],
                "engine_inputs": engine[key]["engine_inputs"],
                "result_receipt_sha256": engine[key]["receipt_sha256"],
                "sources_and_uses": engine[key]["sources_and_uses"],
                "ending_debt_cents": engine[key]["debt_schedule"]["ending_debt_cents"],
                "minimum_liquidity_cents": engine[key]["debt_schedule"]["minimum_liquidity_cents"],
                "first_covenant_breach_month": engine[key]["debt_schedule"]["first_covenant_breach_month"],
                "has_payment_default": engine[key]["debt_schedule"]["has_payment_default"],
                "debt_schedule": engine[key]["debt_schedule"],
                "arr_cents_by_month": engine[key]["arr_cents_by_month"],
                "revenue_cents_by_month": engine[key]["revenue_cents_by_month"],
                "sponsor_cash_flows": engine[key]["sponsor_cash_flows"],
                "exit_enterprise_value_cents": engine[key]["exit_enterprise_value_cents"],
                "exit_equity_value_cents": engine[key]["exit_equity_value_cents"],
                "earnout_cents": engine[key]["earnout_cents"],
                "gross_moic": engine[key]["gross_moic"],
                "gross_xirr": engine[key]["gross_xirr"],
            }
            for key in ("ask", "selected", "downside")
        },
        "maximum_bid_cents": engine["maximum_bid_cents"],
        "distribution": engine["distribution"],
        "sensitivities": engine["sensitivities"],
        "sensitivity_receipt_sha256": engine["sensitivities"]["receipt_sha256"],
        "value_creation": case["valueCreation"],
        "value_creation_bridge": bridge,
        "analysis_receipts": [
            {
                "analysis_id": item["analysis_id"],
                "classification": item["classification"],
                "state": item["state"],
                "spec_sha256": item["spec_sha256"],
                "receipt_sha256": item["receipt_sha256"],
            }
            for item in case["analyses"]
        ],
        "temporal_scan": case["temporalScan"],
    }
    body["packet_sha256"] = digest(body)
    return body


def _memo_markdown(packet: dict[str, Any]) -> str:
    decision = packet["decision"]
    ask = packet["scenarios"]["ask"]
    selected = packet["scenarios"]["selected"]
    downside = packet["scenarios"]["downside"]
    bridge = packet["value_creation_bridge"]
    uses = selected["sources_and_uses"]
    distribution = packet["distribution"]
    operating = selected["engine_inputs"]["operating"]
    transaction = selected["engine_inputs"]["transaction"]
    selected_annual = [item for item in selected["debt_schedule"]["months"] if item["month"] % 12 == 0]
    downside_annual = {item["month"]: item for item in downside["debt_schedule"]["months"] if item["month"] % 12 == 0}
    matrix = packet["sensitivities"]["entry_exit_matrix"]
    pure_human_value = sum(
        item["exit_equity_delta_cents"]
        for item in bridge["standalone"]
        if item["credit_classification"] == "HUMAN_JUDGMENT"
    )
    mixed_value = sum(
        item["exit_equity_delta_cents"]
        for item in bridge["standalone"]
        if item["credit_classification"] != "HUMAN_JUDGMENT"
    )
    start_revenue = int(operating["starting_ltm_revenue_cents"])
    start_ebitda = int(operating["starting_normalized_ebitda_cents"])
    entry_ev = selected["sources_and_uses"]["uses_cents"]["cash_enterprise_value"]
    lines = [
        f"# {packet['company']} — illustrative investment committee memorandum",
        "",
        f"> {packet['disclosure']}",
        "",
        f"**Provisional posture:** `{decision['decision']}`  ",
        f"**Workflow state:** `{decision['status']}` / `{decision['signature_status']}`  ",
        f"**Knowledge cutoff:** `{decision['as_of']}`",
        f"**Packet receipt:** `{packet['packet_sha256']}`",
        "",
        "## Recommendation",
        "",
        decision["rationale"],
        "",
        "The asking price fails the frozen return hurdle. The selected upfront structure clears the base hurdle while preserving the declared downside floor; open diligence conditions and founder adjudication still prevent approval.",
        "",
        "| Case | Upfront EV | Gross IRR | Gross MOIC | Exit debt | Minimum liquidity | Covenant breach |",
        "|---|---:|---:|---:|---:|---:|---|",
        f"| Seller ask | {_money(ask['sources_and_uses']['uses_cents']['cash_enterprise_value'])} | {_percent(ask['gross_xirr'])} | {_multiple(ask['gross_moic'])} | {_money(ask['ending_debt_cents'])} | {_money(ask['minimum_liquidity_cents'])} | {ask['first_covenant_breach_month'] or 'None'} |",
        f"| Selected | {_money(selected['sources_and_uses']['uses_cents']['cash_enterprise_value'])} | {_percent(selected['gross_xirr'])} | {_multiple(selected['gross_moic'])} | {_money(selected['ending_debt_cents'])} | {_money(selected['minimum_liquidity_cents'])} | {selected['first_covenant_breach_month'] or 'None'} |",
        f"| Downside | {_money(downside['sources_and_uses']['uses_cents']['cash_enterprise_value'])} | {_percent(downside['gross_xirr'])} | {_multiple(downside['gross_moic'])} | {_money(downside['ending_debt_cents'])} | {_money(downside['minimum_liquidity_cents'])} | {downside['first_covenant_breach_month'] or 'None'} |",
        "",
        "## Price and structure",
        "",
        f"- Maximum upfront bid under the fixed selected terms: **{_money(packet['maximum_bid_cents'])}**.",
        f"- Selected sponsor equity at close: **{_money(uses['sponsor_equity_cents'])}**.",
        f"- Funded term debt at face: **{_money(int(selected['sources_and_uses']['non_sponsor_sources_cents']['funded_term_debt_net_oid']) + int(selected['sources_and_uses']['uses_cents']['financing_fees']))}**; the undrawn revolver remains liquidity capacity, not a source.",
        f"- Selected contingent earnout paid in the modeled base case: **{_money(selected['earnout_cents'])}**; downside payout: **{_money(downside['earnout_cents'])}**.",
        "",
        "## Operating case and valuation bridge",
        "",
        "| Metric | Entry / LTM | Exit / year 5 | Underwriting implication |",
        "|---|---:|---:|---|",
        f"| ARR | {_money(int(operating['starting_arr_cents']))} | {_money(int(selected['arr_cents_by_month'][-1]))} | Full-cohort retention, not active-only retention, anchors the path. |",
        f"| Revenue | {_money(start_revenue)} | {_money(int(selected['revenue_cents_by_month'][-1]) * 12)} | Monthly exit revenue is annualized for comparability. |",
        f"| Normalized / lender EBITDA | {_money(start_ebitda)} | {_money(int(selected['debt_schedule']['months'][-1]['trailing_lender_ebitda_cents']))} | Entry earnings are normalized from QoE; exit uses the lender schedule. |",
        f"| Gross margin | {Decimal(operating['gross_margin']) * 100:.2f}% | Scenario path | Fully burdened costs remain included. |",
        f"| Entry EV / normalized EBITDA | {Decimal(entry_ev) / Decimal(start_ebitda):.2f}x | — | Price discipline is tested against normalized, not seller-adjusted, EBITDA. |",
        f"| Entry EV / LTM revenue | {Decimal(entry_ev) / Decimal(start_revenue):.2f}x | — | Revenue multiple is a cross-check, not the return engine. |",
        f"| Exit EV / lender EBITDA | — | {transaction['exit_multiple']}x | Exit multiple is a human scenario assumption. |",
        "",
        "## Leverage, liquidity, and covenant workpaper",
        "",
        "| Year | Selected debt | Selected liquidity | Selected leverage | Selected headroom | Downside debt | Downside headroom |",
        "|---:|---:|---:|---:|---:|---:|---:|",
        *[
            f"| {item['month'] // 12} | {_money(item['ending_term_cents'] + item['ending_revolver_cents'])} | {_money(item['ending_cash_cents'])} | {Decimal(item['gross_leverage']):.2f}x | {Decimal(item['covenant_headroom']):.2f}x | {_money(downside_annual[item['month']]['ending_term_cents'] + downside_annual[item['month']]['ending_revolver_cents'])} | {Decimal(downside_annual[item['month']]['covenant_headroom']):.2f}x |"
            for item in selected_annual
        ],
        "",
        "## Sensitivity and distributional downside",
        "",
        "The named downside is a deterministic stress case. The conditional distribution is a separate set of 1,000 correlated scenario paths—not a forecast—and must not be read as investment accuracy.",
        "",
        "| Conditional path statistic | p10 | p50 | p90 |",
        "|---|---:|---:|---:|",
        f"| Gross MOIC | {_multiple(distribution['moic_quantiles'][0])} | {_multiple(distribution['moic_quantiles'][1])} | {_multiple(distribution['moic_quantiles'][2])} |",
        f"| Gross IRR | {_percent(distribution['xirr_quantiles'][0])} | {_percent(distribution['xirr_quantiles'][1])} | {_percent(distribution['xirr_quantiles'][2])} |",
        "",
        f"- Probability below 1.0x MOIC: **{_percent(distribution['probability_below_one'])}**.",
        f"- Probability of a modeled covenant breach: **{_percent(distribution['probability_covenant_breach'])}**.",
        f"- Probability of modeled payment default: **{_percent(distribution['probability_payment_default'])}**.",
        f"- Named downside floor: **{_percent(downside['gross_xirr'])} IRR / {_multiple(downside['gross_moic'])} MOIC**; distributional p10: **{_percent(distribution['xirr_quantiles'][0])} / {_multiple(distribution['moic_quantiles'][0])}**.",
        "",
        "### Entry value × exit multiple sensitivity",
        "",
        "| Entry / exit | 5.5x | 6.5x | 7.5x |",
        "|---|---:|---:|---:|",
        *[
            "| " + entry_label + " | " + " | ".join(
                f"{_percent(next(item for item in matrix if item['assumption_label'] == f'{entry_label} / {exit_label}')['gross_xirr'])} / {_multiple(next(item for item in matrix if item['assumption_label'] == f'{entry_label} / {exit_label}')['gross_moic'])}"
                for exit_label in ("5.5x", "6.5x", "7.5x")
            ) + " |"
            for entry_label in ("$200M", "$210M", "$220M")
        ],
        "",
        "## Underwriting thesis and counterthesis",
        "",
        packet["thesis"]["statement"],
        "",
        f"**Counterthesis:** {packet['thesis']['counterthesis']}",
        "",
        "### Decisive drivers",
        "",
        *[f"- {item}" for item in packet["thesis"]["drivers"]],
        "",
        "### Team judgment — synthetic room only",
        "",
        "No person-level management conclusion is identified from this synthetic data room. The observations below describe retained operating evidence and explicit diligence gaps, not reference-checked executive assessment.",
        "",
        "| Dimension | Assessment |",
        "|---|---|",
        f"| Observable operating strengths | {' '.join(packet['team_assessment']['strengths'])} |",
        f"| Unproven capabilities | {' '.join(packet['team_assessment']['unproven'])} |",
        f"| Key-person risk | {packet['team_assessment']['key_person_risk']} |",
        f"| Required hires / capacity | {' '.join(packet['team_assessment']['required_hires'])} |",
        "",
        "### Falsifiers and open diligence",
        "",
        *[f"- {item}" for item in packet["thesis"]["falsifiers"]],
        *[f"- OPEN: {item}" for item in packet["thesis"]["requests"]],
        "",
        "### Risk, mitigant, owner, and consequence",
        "",
        "| Risk / open item | Mitigant or required proof | Owner | Failure consequence |",
        "|---|---|---|---|",
        "| Cancellation-for-convenience exposure | Contract sample tied to billed and live ARR definitions | Deal team / counsel | Reduce price or tighten earnout eligibility |",
        "| Parent concentration | Legal-parent map tied to master agreements | Commercial diligence lead | Retain HOLD; concentration-conditioned terms |",
        "| Seller add-backs and lender EBITDA | QoE support plus lender-definition bridge | CFO / QoE lead | Reduce debt capacity and maximum bid |",
        "| Renewal economics | Safer renewal design and replicated measurement | CRO | Zero broad price-led upside credit |",
        "| Downside leverage | Monthly covenant and liquidity rerun | Financing lead | Reduce funded debt or entry value |",
        "",
        "## Evidence-to-model credit",
        "",
        "| Evidence | Observed | Model mapping | Credit class | Decision response |",
        "|---|---|---|---|---|",
        *[
            f"| {item['source_analysis_id']} | {item['observed_value']} | {item['model_credit']} | {item['credit_classification']} | {item['decision_response']} |"
            for item in packet["evidence_mappings"]
        ],
        "",
        "## Value creation",
        "",
        f"Combined modeled exit-equity impact is **{_money(bridge['combined_exit_equity_delta_cents'])}**, equal to **{_money(bridge['sum_standalone_exit_equity_delta_cents'])}** of standalone effects plus an explicit **{_money(bridge['interaction_residual_cents'])}** interaction residual.",
        f"Of the standalone value, **{_money(pure_human_value)}** is pure human judgment and **{_money(mixed_value)}** is mixed synthetic-causal and human judgment. No value-creation total is presented as an identified real-world effect.",
        "",
        "| Initiative | Credit class | Implementation cost | Exit EBITDA | Exit debt | Exit equity | IRR impact |",
        "|---|---|---:|---:|---:|---:|---:|",
        *[
            f"| {item['label']} | {item['credit_classification']} | {_money(item['implementation_cost_cents'])} | {_money(item['exit_ebitda_delta_cents'])} | {_money(item['exit_debt_delta_cents'])} | {_money(item['exit_equity_delta_cents'])} | {_percent(item['gross_xirr_delta'])} |"
            for item in bridge["standalone"]
        ],
        "",
        "### Ownership cadence and board control",
        "",
        "| Phase | Timing | Accountable owner | Required milestone | Board KPI | Stop rule |",
        "|---|---|---|---|---|---|",
        *[
            f"| {item['phase']} | {item['timing']} | {item['owner']} | {item['milestone']} | {item['kpi']} | {item['stop_rule']} |"
            for item in packet["ownership_cadence"]
        ],
        "",
        "## Analytical boundary",
        "",
        "This packet is generated from a fictional, deterministic data room. Synthetic causal estimates recover planted assignment mechanisms only. Conditional simulations are scenario distributions, not forecasts. The record is unsigned, the diligence conditions remain open, and no investment authority is delegated to the software.",
        "",
        "## Receipt appendix",
        "",
        f"- Case analysis: `{packet['analysis_sha256']}`",
        f"- ASK result: `{ask['result_receipt_sha256']}`",
        f"- SELECTED result: `{selected['result_receipt_sha256']}`",
        f"- DOWNSIDE result: `{downside['result_receipt_sha256']}`",
        f"- Sensitivity book: `{packet['sensitivity_receipt_sha256']}`",
        f"- Value-creation bridge: `{bridge['receipt_sha256']}`",
        "",
    ]
    return "\n".join(lines)


def _memo_html(markdown: str, packet: dict[str, Any]) -> str:
    def inline(value: str) -> str:
        rendered = escape(value)
        rendered = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", rendered)
        return re.sub(r"`(.+?)`", r"<code>\1</code>", rendered)

    paragraphs = []
    in_table = False
    for line in markdown.splitlines():
        if line.startswith("# "):
            paragraphs.append(f"<h1>{inline(line[2:])}</h1>")
        elif line.startswith("## "):
            paragraphs.append(f"<h2>{inline(line[3:])}</h2>")
        elif line.startswith("### "):
            paragraphs.append(f"<h3>{inline(line[4:])}</h3>")
        elif line.startswith("> "):
            paragraphs.append(f"<aside>{inline(line[2:])}</aside>")
        elif line.startswith("|---"):
            continue
        elif line.startswith("|"):
            cells = [inline(item.strip()) for item in line.strip("|").split("|")]
            tag = "th" if not in_table else "td"
            if not in_table:
                paragraphs.append("<table><thead>")
            paragraphs.append("<tr>" + "".join(f"<{tag}>{item}</{tag}>" for item in cells) + "</tr>")
            if not in_table:
                paragraphs.append("</thead><tbody>")
                in_table = True
        else:
            if in_table:
                paragraphs.append("</tbody></table>")
                in_table = False
            if line.startswith("- "):
                paragraphs.append(f"<p class=bullet>• {inline(line[2:])}</p>")
            elif line:
                paragraphs.append(f"<p>{inline(line)}</p>")
    if in_table:
        paragraphs.append("</tbody></table>")
    style = """
    @page{size:letter;margin:.55in}*{box-sizing:border-box}body{margin:0;color:#20262b;font:10.5px/1.45 Arial,sans-serif}h1,h2,h3{font-family:Georgia,serif;font-weight:500}h1{font-size:30px;border-bottom:2px solid #20262b;padding-bottom:12px}h2{font-size:19px;margin-top:26px;border-bottom:1px solid #aaa;padding-bottom:5px}h3{font-size:14px}aside{border:1px solid #8a3d2f;color:#8a3d2f;padding:8px;font:700 9px monospace}p{margin:7px 0}.bullet{padding-left:12px}code{font:9px monospace;color:#234fa4;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:10px 0 18px;page-break-inside:avoid}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}th{font:700 8px monospace;text-transform:uppercase;color:#586269}footer{margin-top:30px;border-top:1px solid #20262b;padding-top:8px;font:8px monospace;color:#586269}@media screen{body{max-width:900px;margin:40px auto;padding:40px;background:#fbf9f4}}
    """
    return f"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{escape(packet['company'])} IC memorandum</title><style>{style}</style></head><body>{''.join(paragraphs)}<footer>Packet {packet['packet_sha256']} · {escape(packet['disclosure'])}</footer></body></html>"


def build_ic_packet_from_case(case: dict[str, Any], output_dir: str | Path) -> dict[str, Path]:
    validate_workbench_case(case)
    if case.get("caseId") != "atlasgrid" or "peEngine" not in case:
        raise ValueError("ic_packet_requires_atlasgrid_pe_v2")
    failed = [
        f"{receipt['analysis_id']}:{diagnostic['name']}"
        for receipt in case["analyses"]
        for diagnostic in receipt["diagnostics"]
        if diagnostic["status"] == "FAIL"
    ]
    if failed:
        raise ValueError(f"ic_packet_blocked_failed_diagnostic:{','.join(failed)}")
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    packet = _packet(case)
    markdown = _memo_markdown(packet)
    html = _memo_html(markdown, packet)
    memo_path = destination / "ic-memo.md"
    html_path = destination / "ic-memo.html"
    appendix_path = destination / "model-appendix.json"
    memo_path.write_text(markdown, encoding="utf-8")
    html_path.write_text(html, encoding="utf-8")
    write_json(appendix_path, packet)
    receipt = {
        "schema_version": "underwriting.ic-packet-receipt/v2",
        "packet_sha256": packet["packet_sha256"],
        "artifacts": {
            memo_path.name: sha256_file(memo_path),
            html_path.name: sha256_file(html_path),
            appendix_path.name: sha256_file(appendix_path),
        },
    }
    receipt["receipt_sha256"] = digest(receipt)
    receipt_path = destination / "packet-receipt.json"
    write_json(receipt_path, receipt)
    return {
        "memo": memo_path,
        "html": html_path,
        "appendix": appendix_path,
        "receipt": receipt_path,
    }


def build_ic_packet(analysis_path: str | Path, output_dir: str | Path) -> dict[str, Path]:
    case = json.loads(Path(analysis_path).read_text(encoding="utf-8"))
    return build_ic_packet_from_case(case, output_dir)
