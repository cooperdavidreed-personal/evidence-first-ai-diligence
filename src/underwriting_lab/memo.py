from __future__ import annotations

from html import escape
import json
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
    return f"{float(decimal) * 100:.2f}%"


def _multiple(decimal: str) -> str:
    return f"{float(decimal):.2f}x"


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
        "evidence_mappings": case["evidenceMappings"],
        "scenarios": {
            key: {
                "scenario_id": engine[key]["scenario_id"],
                "engine_inputs_sha256": engine[key]["engine_inputs_sha256"],
                "result_receipt_sha256": engine[key]["receipt_sha256"],
                "sources_and_uses": engine[key]["sources_and_uses"],
                "ending_debt_cents": engine[key]["debt_schedule"]["ending_debt_cents"],
                "minimum_liquidity_cents": engine[key]["debt_schedule"]["minimum_liquidity_cents"],
                "first_covenant_breach_month": engine[key]["debt_schedule"]["first_covenant_breach_month"],
                "has_payment_default": engine[key]["debt_schedule"]["has_payment_default"],
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
    lines = [
        f"# {packet['company']} — illustrative investment committee memorandum",
        "",
        f"> {packet['disclosure']}",
        "",
        f"**Provisional posture:** `{decision['decision']}`  ",
        f"**Workflow state:** `{decision['status']}` / `{decision['signature_status']}`  ",
        f"**Knowledge cutoff:** `{decision['as_of']}`  ",
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
        "### Falsifiers and open diligence",
        "",
        *[f"- {item}" for item in packet["thesis"]["falsifiers"]],
        *[f"- OPEN: {item}" for item in packet["thesis"]["requests"]],
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
        "",
        "| Initiative | Credit class | Implementation cost | Exit EBITDA | Exit debt | Exit equity | IRR impact |",
        "|---|---|---:|---:|---:|---:|---:|",
        *[
            f"| {item['label']} | {item['credit_classification']} | {_money(item['implementation_cost_cents'])} | {_money(item['exit_ebitda_delta_cents'])} | {_money(item['exit_debt_delta_cents'])} | {_money(item['exit_equity_delta_cents'])} | {_percent(item['gross_xirr_delta'])} |"
            for item in bridge["standalone"]
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
