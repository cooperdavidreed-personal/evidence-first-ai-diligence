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


def _illustrative_money_range(cents: int) -> str:
    def two_significant_millions(value_cents: Decimal) -> str:
        millions = value_cents / Decimal(100_000_000)
        quantum = Decimal(1).scaleb(millions.adjusted() - 1)
        rendered = format(millions.quantize(quantum), "f")
        return rendered.rstrip("0").rstrip(".") if "." in rendered else rendered

    low = two_significant_millions(Decimal(cents) * Decimal("0.50"))
    high = two_significant_millions(Decimal(cents) * Decimal("1.50"))
    return f"≈${low}–${high}M"


def _percent(decimal: str) -> str:
    return f"{Decimal(decimal) * 100:.1f}%"


def _multiple(decimal: str) -> str:
    return f"{Decimal(decimal):.1f}x"


def _diligence_line(item: dict[str, Any]) -> str:
    return (
        f"- OPEN **{item['request_id']} · {item['materiality']} · "
        f"{item['due_state']}** — {item['request']} Owner: {item['owner']}. "
        f"Decision consequence: {item['decision_consequence']}"
    )


def _ascii_dashes(value: str) -> str:
    return value.translate(str.maketrans({"—": "-", "–": "-", "‑": "-", "−": "-"}))


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


def _vc_packet(case: dict[str, Any]) -> dict[str, Any]:
    engine = case["vcEngine"]
    body: dict[str, Any] = {
        "schema_version": "underwriting.vc-ic-packet/v2",
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
        "scenarios": {
            key: engine[key]
            for key in ("base", "milestone", "downside", "financing_shortfall")
        },
        "milestone_contract": engine["milestone_contract"],
        "exit_value_basis": engine["exit_value_basis"],
        "operating_exit_bridges": engine["operating_exit_bridges"],
        "distribution": engine["distribution"],
        "sensitivities": engine["sensitivities"],
        "value_creation": case["valueCreation"],
        "value_creation_bridge": case["vcValueCreationBridge"],
        "analysis_receipts": [
            {
                "analysis_id": item["analysis_id"],
                "classification": item["classification"],
                "state": item["state"],
                "spec_sha256": item["spec_sha256"],
                "receipt_sha256": item["receipt_sha256"],
                "outputs": item["outputs"],
            }
            for item in case["analyses"]
        ],
        "temporal_scan": case["temporalScan"],
    }
    body["packet_sha256"] = digest(body)
    return body


def _vc_memo_markdown(packet: dict[str, Any]) -> str:
    decision = packet["decision"]
    scenarios = packet["scenarios"]
    base = scenarios["base"]
    selected = scenarios["milestone"]
    downside = scenarios["downside"]
    shortfall = scenarios["financing_shortfall"]
    loss_hurdle = next(
        item
        for item in decision["metric_pairs"]
        if item["metric_id"] == "helios-hx-09-probability_below_1x"
    )
    close_event = next(
        item for item in selected["financing_events"] if item["event_id"] == "series-c-close"
    )
    first_close_ownership = Decimal(close_event["ownership_numerator"]) / Decimal(
        close_event["ownership_denominator"]
    )
    annual_cash = [item for item in selected["cash_by_month"] if item["month"] % 12 == 0]
    analysis = {item["analysis_id"]: item for item in packet["analysis_receipts"]}
    lever_rows = list(
        zip(
            packet["value_creation"],
            packet["value_creation_bridge"]["standalone"],
            strict=True,
        )
    )
    pool_exit_copy = (
        "Unissued option-pool shares are treated as fully granted common at exit "
        "and share pro rata in residual proceeds."
        if selected["pool_exit_treatment"] == "FULLY_GRANTED_COMMON"
        else "Unissued option-pool shares are cancelled before exit and receive no proceeds."
    )
    lines = [
        f"# {packet['company']} — illustrative venture investment committee memorandum",
        "",
        f"> {packet['disclosure']}",
        "",
        f"**Conditional posture:** `{decision['decision']}` subject to the executable terms and falsifiers below.",
        "",
        f"**Authority:** `{decision['status']}` / `{decision['signature_status']}` / no delegated investment authority.",
        "",
        f"**Knowledge cutoff:** `{decision['as_of']}`",
        f"**Packet receipt:** `{packet['packet_sha256']}`",
        "",
        "## Recommendation and executable terms",
        "",
        decision["rationale"],
        f"**Binding loss hurdle:** {loss_hurdle['observed']} versus {loss_hurdle['threshold']}; status `{loss_hurdle['status']}`. The conditional posture is not funding approval while this test and the diligence gates remain open.",
        "",
        "| Term | Exact selected-case position |",
        "|---|---|",
        "| Security | Series C, 1x non-participating preference, senior to A/B and junior to any declared bridge |",
        f"| Initial / conditional capital | {_money(2_500_000_000)} at close / {_money(packet['milestone_contract']['amount_cents'])} at month {packet['milestone_contract']['test_month']} |",
        f"| Valuation | {_money(16_000_000_000)} pre-money / {_money(20_000_000_000)} fully funded post-money |",
        f"| Series C ownership | {first_close_ownership * 100:.2f}% at first close / {Decimal(selected['target_ownership']) * 100:.2f}% fully funded |",
        f"| Option pool | {selected['unissued_pool_shares']:,} unissued shares after refresh; pre-money holders bear the refresh |",
        f"| Selected milestone returns | {_percent(selected['gross_xirr'])} gross XIRR / {_multiple(selected['gross_moic'])} gross MOIC |",
        f"| Down-round returns | {_percent(downside['gross_xirr'])} gross XIRR / {_multiple(downside['gross_moic'])} gross MOIC |",
        f"| Shortfall case | Bridge at month {shortfall['first_cash_exhaustion_month_without_contingent_financing']}; {_percent(shortfall['gross_xirr'])} / {_multiple(shortfall['gross_moic'])} |",
        "",
        "## Product, market, customers, competition, and business model",
        "",
        packet["thesis"]["statement"],
        "",
        "| Dimension | Underwriting judgment | Disconfirming fact / open gate |",
        "|---|---|---|",
        "| Product | GPU-spend control plane with customer-level usage and cost records. | Production replication of the optimizer effect remains open. |",
        "| Market | Tiered Bayesian survey supports a scenario range, not a market fact. | Tier 5 is data-thin and abstained; priors remain explicit. |",
        "| Customers | Ordinary cohorts are separated from hand-picked design partners. | Pooled retention overstates repeatability. |",
        "| Competition | Workflow value depends on neutral provider-cost control. | Provider-native tooling and cloud concentration may compress differentiation. |",
        "| Business model | Usage-linked expansion can compound with customer compute spend. | Gross margin remains exposed to compute, telemetry, and support costs. |",
        "| Terms | Milestone financing limits capital at risk before operating proof. | Failure creates explicit down-round or bridge dilution. |",
        "",
        f"**Counterthesis:** {packet['thesis']['counterthesis']}",
        "",
        "## Team and financing accountability",
        "",
        "These are role-level evidence states, not invented biographies or reference-checked conclusions.",
        "",
        "| Dimension | Assessment |",
        "|---|---|",
        f"| Observable strengths | {' '.join(packet['team_assessment']['strengths'])} |",
        f"| Unproven capabilities | {' '.join(packet['team_assessment']['unproven'])} |",
        f"| Key-person risk | {packet['team_assessment']['key_person_risk']} |",
        f"| Required capacity | {' '.join(packet['team_assessment']['required_hires'])} |",
        "",
        "## Cap table and financing-event bridge",
        "",
        "| Scenario | Funded Series C | Ownership | Minimum cash | Exit proceeds | Gross XIRR | Gross MOIC |",
        "|---|---:|---:|---:|---:|---:|---:|",
        *[
            f"| {item['scenario_id']} | {_money(item['target_invested_cents'])} | {Decimal(item['target_ownership']) * 100:.2f}% | {_money(item['minimum_cash_cents'])} | {_money(item['target_proceeds_cents'])} | {_percent(item['gross_xirr'])} | {_multiple(item['gross_moic'])} |"
            for item in (base, selected, downside, shortfall)
        ],
        "",
        "| Selected event | Month | Status | Cash | New shares | Fully diluted shares |",
        "|---|---:|---|---:|---:|---:|",
        *[
            f"| {item['event_id']} | {item['actual_month']} | {item['status']} | {_money(item['new_money_cents'])} | {item['new_shares']:,} | {item['fully_diluted_after']:,} |"
            for item in selected["financing_events"]
        ],
        "",
        "## Milestone financing and monthly runway",
        "",
        f"The {_money(packet['milestone_contract']['amount_cents'])} second tranche releases only when `{packet['milestone_contract']['release_rule']}` after a {packet['milestone_contract']['cure_period_days']}-day cure. Evaluator: `{packet['milestone_contract']['evaluator']}`. Failure consequence: `{packet['milestone_contract']['failure_consequence']}`.",
        "",
        *[
            f"- `{item['metric_id']}` {item['operator']} `{item['threshold']}` over `{item['period']}`."
            for item in packet["milestone_contract"]["tests"]
        ],
        "",
        "| Year | Ending cash |",
        "|---:|---:|",
        *[f"| {item['month'] // 12} | {_money(item['ending_cash_cents'])} |" for item in annual_cash],
        "",
        "## Preference waterfall and investor return bridge",
        "",
        "The selected exit equity value is not a naked outcome assumption. It is derived from the retained LTM revenue ledger and a declared five-year operating and valuation scenario:",
        "",
        "| Exit-value operand | Selected milestone case | Classification |",
        "|---|---:|---|",
        f"| Observed LTM revenue | {_money(packet['operating_exit_bridges']['milestone']['observed_ltm_revenue_cents'])} | Retained synthetic P&L |",
        f"| Annual revenue growth / hold | {_percent(packet['operating_exit_bridges']['milestone']['annual_revenue_growth'])} / {packet['operating_exit_bridges']['milestone']['years']} years | Scenario |",
        f"| Terminal revenue / exit multiple | {_money(packet['operating_exit_bridges']['milestone']['terminal_revenue_cents'])} / {_multiple(packet['operating_exit_bridges']['milestone']['exit_revenue_multiple'])} | Scenario |",
        f"| Exit enterprise value / cash | {_money(packet['operating_exit_bridges']['milestone']['exit_enterprise_value_cents'])} / {_money(packet['operating_exit_bridges']['milestone']['cash_at_exit_cents'])} | Accounting bridge; net debt is {_money(packet['operating_exit_bridges']['milestone']['net_debt_cents'])} |",
        f"| Exit equity value | {_money(packet['operating_exit_bridges']['milestone']['exit_equity_value_cents'])} | Waterfall operand |",
        "",
        f"Exit value basis is `{packet['exit_value_basis']}`. {pool_exit_copy} Class proceeds conserve to {_money(selected['waterfall']['exit_value_cents'])} with a {selected['waterfall']['conservation_residual_cents']}-cent residual.",
        "",
        "| Class | Election | Preference | Residual | Total proceeds |",
        "|---|---|---:|---:|---:|",
        *[
            f"| {class_id} | {'CONVERT' if selected['waterfall']['conversion_profile'][class_id] else 'PREFERENCE'} | {_money(selected['waterfall']['class_preference_cents'][class_id])} | {_money(selected['waterfall']['class_residual_cents'][class_id])} | {_money(proceeds)} |"
            for class_id, proceeds in selected["waterfall"]["class_proceeds_cents"].items()
        ],
        "",
        f"Series C invests {_money(selected['target_invested_cents'])} in dated funded tranches and receives {_money(selected['target_proceeds_cents'])} at exit: **{_percent(selected['gross_xirr'])} gross XIRR / {_multiple(selected['gross_moic'])} gross MOIC**.",
        "",
        "## Conditional distribution and sensitivity",
        "",
        "The 1,000 retained paths replay the full financing ledger and exact waterfall. They are scenario priors, not a forecast or evidence of real-world accuracy.",
        "",
        "Declared scenario-state priors: " + "; ".join(
            f"{name.replace('_', ' ').title()} {_percent(value)}"
            for name, value in packet["distribution"]["template_weights"].items()
        ) + ".",
        "",
        "| Statistic | p10 | p50 | p90 |",
        "|---|---:|---:|---:|",
        f"| Gross MOIC | {_multiple(packet['distribution']['moic_quantiles'][0])} | {_multiple(packet['distribution']['moic_quantiles'][1])} | {_multiple(packet['distribution']['moic_quantiles'][2])} |",
        f"| Gross XIRR | {_percent(packet['distribution']['xirr_quantiles'][0])} | {_percent(packet['distribution']['xirr_quantiles'][1])} | {_percent(packet['distribution']['xirr_quantiles'][2])} |",
        "",
        f"- Probability below 1.0x: **{_percent(packet['distribution']['probability_below_one'])}** (Monte Carlo SE **{packet['distribution']['probability_below_one_monte_carlo_se_pp']} pp**, 1,000 draws).",
        f"- Sensitivity book: {len(packet['sensitivities']['cells'])} full-engine cells across exit value, exit date, later-round price, and milestone state.",
        "",
        "## Econometric credit and zero-credit map",
        "",
        f"- HX-06 (`{analysis['HX-06']['classification']}`) supports only the randomized synthetic optimizer estimand and tested population.",
        f"- HX-07 (`{analysis['HX-07']['classification']}`) receives zero base-case causal credit because adoption follows spend spikes and identification fails.",
        f"- HX-05 (`{analysis['HX-05']['classification']}`) is a prior-sensitive market-size scenario, not causal evidence.",
        "",
        "## Value creation and board cadence",
        "",
        f"Combined full-model impact: **{_money(packet['value_creation_bridge']['combined_minimum_cash_delta_cents'])} minimum cash**, **{_money(packet['value_creation_bridge']['combined_target_proceeds_delta_cents'])} Series C proceeds**, **{_percent(packet['value_creation_bridge']['combined_gross_xirr_delta'])} gross XIRR**, including an explicit **{_money(packet['value_creation_bridge']['interaction_residual_cents'])} interaction residual**.",
        "",
        "| Initiative | Evidence class | Baseline / target | Owner | Modeled consequence | Stop rule / risk |",
        "|---|---|---|---|---|---|",
        *[
            f"| {item['initiative']} | {item.get('credit_classification', 'HUMAN_JUDGMENT')} | {item['baseline']} / {item['target']} | {item['owner']} | {_money(lever['monthly_cash_delta_cents'])}/month cash; {_money(lever['exit_value_delta_cents'])} exit value; {_money(lever['implementation_cost_cents'])} cost | {item['risk']} |"
            for item, lever in lever_rows
        ],
        "",
        "### Economic mapping register",
        "",
        *[
            f"- **{item['initiative']}:** {lever['economic_mapping']['formula']}. Inputs: "
            + "; ".join(
                f"{key}={value}"
                for key, value in lever["economic_mapping"].items()
                if key != "formula"
            )
            for item, lever in lever_rows
        ],
        "",
        "| Phase | Timing | Owner | Milestone | KPI | Stop rule |",
        "|---|---|---|---|---|---|",
        *[
            f"| {item['phase']} | {item['timing']} | {item['owner']} | {item['milestone']} | {item['kpi']} | {item['stop_rule']} |"
            for item in packet["ownership_cadence"]
        ],
        "",
        "## Falsifiers, open diligence, and limitations",
        "",
        *[f"- FALSIFIER: {item}" for item in packet["thesis"]["falsifiers"]],
        *[_diligence_line(item) for item in packet["thesis"]["requests"]],
        "",
        "This packet is generated from a fictional deterministic room. Synthetic causal estimates recover planted mechanisms only. Scenario outputs are not forecasts. The investment record remains unsigned and requires human IC authority.",
        "",
        "## Receipt appendix",
        "",
        *[
            f"- {key.upper()} result: `{value['receipt_sha256']}`"
            for key, value in packet["scenarios"].items()
            if key in {"milestone", "downside"}
        ],
        f"- Sensitivity book: `{packet['sensitivities']['receipt_sha256']}`",
        f"- Value-creation bridge: `{packet['value_creation_bridge']['receipt_sha256']}`",
        "",
    ]
    return "\n".join(lines)


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
        f"- Probability below 1.0x MOIC: **{_percent(distribution['probability_below_one'])}** (Monte Carlo SE **{distribution['probability_below_one_monte_carlo_se_pp']} pp**, 1,000 draws).",
        f"- Probability of a modeled covenant breach: **{_percent(distribution['probability_covenant_breach'])}** (Monte Carlo SE **{distribution['probability_covenant_breach_monte_carlo_se_pp']} pp**, 1,000 draws).",
        f"- Probability of modeled payment default: **{_percent(distribution['probability_payment_default'])}** (Monte Carlo SE **{distribution['probability_payment_default_monte_carlo_se_pp']} pp**, 1,000 draws).",
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
        *[_diligence_line(item) for item in packet["thesis"]["requests"]],
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
        f"Pure human-judgment effects are presented as an **{_illustrative_money_range(pure_human_value)} illustrative 50–150% range** around the selected scenario; **{_money(mixed_value)}** is mixed synthetic-causal and human judgment. No value-creation total is presented as an identified real-world effect.",
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


def _memo_html(markdown: str, packet: dict[str, Any], artifact_kind: str = "packet") -> str:
    def inline(value: str) -> str:
        rendered = escape(value)
        rendered = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", rendered)
        return re.sub(r"`(.+?)`", r"<code>\1</code>", rendered)

    paragraphs = []
    in_table = False
    compact_receipts = False
    for line in markdown.splitlines():
        if line.startswith("# "):
            paragraphs.append(f"<h1>{inline(line[2:])}</h1>")
        elif line.startswith("## "):
            compact_receipts = line[3:] == "Receipt appendix"
            paragraphs.append(f"<h2{' class=receipt-title' if compact_receipts else ''}>{inline(line[3:])}</h2>")
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
                paragraphs.append(f"<p class='bullet{' receipt-row' if compact_receipts else ''}'>• {inline(line[2:])}</p>")
            elif line:
                paragraphs.append(f"<p{' class=receipt-row' if compact_receipts else ''}>{inline(line)}</p>")
    if in_table:
        paragraphs.append("</tbody></table>")
    style = """
    @page{size:letter;margin:.55in .55in .66in;@bottom-left{content:"Underwriting Intelligence Lab";font:7.5px monospace;color:#586269}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:7.5px monospace;color:#586269}}*{box-sizing:border-box}body{margin:0;color:#20262b;font:11px/1.43 Arial,sans-serif}h1,h2,h3{font-family:Georgia,serif;font-weight:500;break-after:avoid-page}h1{font-size:30px;border-bottom:2px solid #20262b;padding-bottom:12px}h2{font-size:19px;margin-top:24px;border-bottom:1px solid #aaa;padding-bottom:5px}h3{font-size:14px}aside{border:1px solid #8a3d2f;color:#8a3d2f;padding:8px;font:700 9px monospace;break-inside:avoid}p{margin:6px 0;orphans:3;widows:3}p:has(+table),h2:has(+p),h3:has(+p){break-after:avoid-page}.bullet{padding-left:12px}.receipt-title{margin-top:18px}.receipt-row{display:inline-block;width:50%;margin:2px 0;padding-right:8px;font-size:8px;line-height:1.25;vertical-align:top}code{font:9px monospace;color:#234fa4;overflow-wrap:anywhere}.receipt-row code{font-size:7px}table{width:100%;border-collapse:collapse;margin:9px 0 16px;break-inside:avoid-page;table-layout:fixed}th,td{border-bottom:1px solid #ccc;padding:5.5px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}th{font:700 8.5px monospace;text-transform:uppercase;color:#586269}tr{break-inside:avoid}footer{display:block;clear:both;margin-top:8px;border-top:1px solid #20262b;padding-top:4px;font:7.5px monospace;color:#586269;break-inside:avoid}.atlasgrid-memo{font-size:10.1px;line-height:1.36}.atlasgrid-memo h1{font-size:28px;padding-bottom:9px}.atlasgrid-memo h2{font-size:17px;margin-top:18px;padding-bottom:4px}.atlasgrid-memo h3{font-size:13px;margin:12px 0 5px}.atlasgrid-memo p{margin:4px 0}.atlasgrid-memo table{margin:7px 0 12px}.atlasgrid-memo th,.atlasgrid-memo td{padding:4.5px}.atlasgrid-memo th{font-size:8px}.atlasgrid-memo code{font-size:8.5px}.snapshot{font-size:9.5px;line-height:1.27}.snapshot h1{font-size:23px;margin:0 0 8px;padding-bottom:7px}.snapshot h2{font-size:14px;margin:11px 0 4px;padding-bottom:2px}.snapshot p{margin:3px 0}.snapshot table{margin:4px 0 7px}.snapshot th,.snapshot td{padding:3px;font-size:7.5px}.technical{font-size:8.5px;line-height:1.25}.technical h1{font-size:23px}.technical h2{font-size:15px;margin-top:15px}.technical h3{font-size:11px}.technical table{margin:5px 0 9px}.technical th,.technical td{padding:3px;font-size:7px}.technical code{font-size:6.5px;word-break:break-all}@media print{footer{display:none}}@media screen{body{max-width:900px;margin:40px auto;padding:40px;background:#fbf9f4}}
    """
    body_class = f"{escape(packet['case_id'])}-memo {escape(artifact_kind)}"
    return f"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{escape(packet['company'])} IC memorandum</title><style>{style}</style></head><body class='{body_class}'>{''.join(paragraphs)}<footer>Packet {packet['packet_sha256']} · {escape(packet['disclosure'])}</footer></body></html>"


def _remove_sections(markdown: str, headings: set[str]) -> str:
    retained: list[str] = []
    skipping = False
    for line in markdown.splitlines():
        if line.startswith("## "):
            skipping = line[3:] in headings
        if not skipping:
            retained.append(line)
    return "\n".join(retained).rstrip() + "\n"


def _packet_markdown(markdown: str, case_id: str) -> str:
    technical_sections = {
        "Receipt appendix",
        "Econometric credit and zero-credit map",
        "Evidence-to-model credit",
    }
    cleaned = _remove_sections(markdown, technical_sections)
    lines = [
        line for line in cleaned.splitlines()
        if not line.startswith(("**Authority:**", "**Knowledge cutoff:**", "**Packet receipt:**", "**Workflow state:**"))
    ]
    result = "\n".join(lines).replace("`MISSES`", "Misses").replace("`CLEARS`", "Clears")
    practitioner_terms = {
        "HUMAN_JUDGMENT": "Analyst judgment",
        "MIXED_CAUSAL_SYNTHETIC_AND_HUMAN_JUDGMENT": "Synthetic causal analysis plus analyst judgment",
        "MIXED_CAUSAL_SYNTHETIC_AND_SCENARIO": "Synthetic causal analysis plus scenario assumption",
        "ALL_TESTS_PASS_AFTER_CURE": "All covenant tests pass after cure",
        "BOARD_FINANCE_COMMITTEE": "Board finance committee",
        "EQUITY_VALUE": "Equity value",
        "FINANCING_SHORTFALL": "Financing shortfall",
        "SERIES_A": "Series A",
        "SERIES_B": "Series B",
        "SERIES_C": "Series C",
        "WITHHOLD_TRANCHE_AND_REUNDERWRITE_RUNWAY": "Withhold tranche and re-underwrite runway",
    }
    for raw, readable in sorted(practitioner_terms.items(), key=lambda item: len(item[0]), reverse=True):
        result = result.replace(raw, readable)
    result = re.sub(
        r"(?m)^- OPEN \*\*[^*]+\*\* - (.+?) Owner: (.+?)\. Decision consequence: (.+)$",
        r"- **\1** Owner: \2. If unresolved: \3",
        result,
    )
    if case_id == "helios":
        result = re.sub(
            r"\*\*Conditional posture:\*\*.*",
            "**Current decision:** HOLD - LOSS HURDLE NOT MET.",
            result,
        )
    return result.rstrip() + "\n"


def _snapshot_markdown(case: dict[str, Any]) -> str:
    decision = case["decision"]
    issues = decision["issue_summary"]
    metrics = case["summaryMetrics"][:5]
    lines = [
        f"# {case['company']} - one-page IC snapshot",
        "",
        f"> {case['disclosure']}",
        "",
        f"## {decision['decision'].replace('_', ' ')}",
        "",
        decision["rationale"],
        "",
        "## Decision economics",
        "",
        "| Measure | Result | Basis |",
        "|---|---:|---|",
        *[f"| {item['label']} | {item['value']} | {item['detail']} |" for item in metrics],
        "",
        "## What blocks advancement",
        "",
        f"{issues['counts']['advancement_blockers']} blocking issues, including {issues['counts']['failed_quantitative_hurdles']} failed quantitative hurdle(s).",
        "",
        *[f"- **{item['title']}** - {item['owner']}; {item['stage'].replace('_', ' ').lower()}. {item['consequence']}" for item in issues["issues"][:4]],
        "",
        "## Path to yes",
        "",
        *[f"- {item}" for item in decision["path_to_yes"]],
        "",
        "**Approval:** Requires investment committee approval. No capital action is authorized.",
        "",
        f"Analysis cutoff: {decision['as_of'][:10]}",
        "",
    ]
    return _ascii_dashes("\n".join(lines))


def _technical_appendix_markdown(case: dict[str, Any], packet: dict[str, Any]) -> str:
    def operand_summary(operand_ids: list[str]) -> str:
        if len(operand_ids) <= 6:
            return ", ".join(f"`{operand}`" for operand in operand_ids)
        preview = ", ".join(f"`{operand}`" for operand in operand_ids[:3])
        return (
            f"{preview}; +{len(operand_ids) - 3} more in model-appendix.json "
            f"(ordered-list SHA-256 `{digest(operand_ids)}`)"
        )

    lines = [
        f"# {case['company']} - technical appendix",
        "",
        f"> {case['disclosure']}",
        "",
        "This appendix retains reproducibility records, raw identifiers, mappings, and formula definitions. It is not the investment-committee front page.",
        "",
        "## Content identity",
        "",
        f"- Manifest SHA-256: `{case['manifest_sha256']}`",
        f"- Analysis SHA-256: `{case['analysis_sha256']}`",
        f"- Decision SHA-256: `{case['decision']['decision_sha256']}`",
        f"- Packet SHA-256: `{packet['packet_sha256']}`",
        "",
        "## Analysis receipts",
        "",
        "| Analysis | Classification | State | Specification | Receipt |",
        "|---|---|---|---|---|",
        *[f"| {item['analysis_id']} | {item['classification']} | {item['state']} | `{item['spec_sha256']}` | `{item['receipt_sha256']}` |" for item in case["analyses"]],
        "",
        "## Evidence-to-model mappings",
        "",
        "| Analysis | Credit class | Observed value | Model treatment |",
        "|---|---|---|---|",
        *[f"| {item['source_analysis_id']} | {item['credit_tier']} | {item['observed_value']} | {item['model_credit']} |" for item in case["evidenceMappings"]],
        "",
        "## Formula register",
        "",
        "| Formula | Operation | Output metric | Operands |",
        "|---|---|---|---|",
        *[f"| `{item['formula_id']}` | {item['operation']} | `{item['output_metric_id']}` | {operand_summary(item['operand_ids'])} |" for item in case["formulaRegistry"]],
        "",
        "## Reproducibility boundary",
        "",
        "All data and results are synthetic. Exact arithmetic, source locators, scenario receipts, and deterministic generation establish internal reproducibility only. They do not establish live-deal accuracy, investment approval, or real-world performance.",
        "",
    ]
    return _ascii_dashes("\n".join(lines))


def build_ic_packet_from_case(case: dict[str, Any], output_dir: str | Path) -> dict[str, Path]:
    validate_workbench_case(case)
    if case.get("caseId") == "atlasgrid" and "peEngine" in case:
        packet_builder = _packet
        memo_builder = _memo_markdown
    elif case.get("caseId") == "helios" and "vcEngine" in case:
        packet_builder = _vc_packet
        memo_builder = _vc_memo_markdown
    else:
        raise ValueError("ic_packet_requires_supported_v2_engine")
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
    packet = packet_builder(case)
    raw_markdown = _ascii_dashes(memo_builder(packet))
    snapshot_markdown = _snapshot_markdown(case)
    packet_markdown = _packet_markdown(raw_markdown, case["caseId"])
    technical_markdown = _technical_appendix_markdown(case, packet)
    snapshot_md_path = destination / "ic-snapshot.md"
    snapshot_html_path = destination / "ic-snapshot.html"
    packet_md_path = destination / "underwriting-packet.md"
    packet_html_path = destination / "underwriting-packet.html"
    technical_md_path = destination / "technical-appendix.md"
    technical_html_path = destination / "technical-appendix.html"
    model_appendix_path = destination / "model-appendix.json"
    snapshot_md_path.write_text(snapshot_markdown, encoding="utf-8")
    snapshot_html_path.write_text(_memo_html(snapshot_markdown, packet, "snapshot"), encoding="utf-8")
    packet_md_path.write_text(packet_markdown, encoding="utf-8")
    packet_html_path.write_text(_memo_html(packet_markdown, packet, "packet"), encoding="utf-8")
    technical_md_path.write_text(technical_markdown, encoding="utf-8")
    technical_html_path.write_text(_memo_html(technical_markdown, packet, "technical"), encoding="utf-8")
    write_json(model_appendix_path, packet)
    artifacts = [snapshot_md_path, snapshot_html_path, packet_md_path, packet_html_path, technical_md_path, technical_html_path, model_appendix_path]
    receipt = {
        "schema_version": "underwriting.ic-packet-receipt/v2",
        "packet_sha256": packet["packet_sha256"],
        "artifacts": {path.name: sha256_file(path) for path in artifacts},
    }
    receipt["receipt_sha256"] = digest(receipt)
    receipt_path = destination / "packet-receipt.json"
    write_json(receipt_path, receipt)
    return {
        "snapshot_markdown": snapshot_md_path,
        "snapshot_html": snapshot_html_path,
        "packet_markdown": packet_md_path,
        "packet_html": packet_html_path,
        "technical_markdown": technical_md_path,
        "technical_html": technical_html_path,
        "appendix": model_appendix_path,
        "receipt": receipt_path,
    }


def build_ic_packet(analysis_path: str | Path, output_dir: str | Path) -> dict[str, Path]:
    case = json.loads(Path(analysis_path).read_text(encoding="utf-8"))
    return build_ic_packet_from_case(case, output_dir)
