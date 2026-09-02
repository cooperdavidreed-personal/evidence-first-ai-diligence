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
                "minimum_liquidity_cents": engine[key]["debt_schedule"][
                    "minimum_liquidity_cents"
                ],
                "first_covenant_breach_month": engine[key]["debt_schedule"][
                    "first_covenant_breach_month"
                ],
                "has_payment_default": engine[key]["debt_schedule"][
                    "has_payment_default"
                ],
                "debt_schedule": engine[key]["debt_schedule"],
                "arr_cents_by_month": engine[key]["arr_cents_by_month"],
                "revenue_cents_by_month": engine[key]["revenue_cents_by_month"],
                "sponsor_cash_flows": engine[key]["sponsor_cash_flows"],
                "exit_enterprise_value_cents": engine[key][
                    "exit_enterprise_value_cents"
                ],
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
    # Risk-policy editing is a separate product surface. Preserve its approved
    # state in the packet when a newer case contract supplies it, while keeping
    # older deterministic fixtures fully supported.
    risk_policy = (
        engine.get("risk_policy") or case.get("riskPolicy") or case.get("risk_policy")
    )
    desk_policy = engine.get("desk_policy") or case.get("deskPolicy")
    risk_sensitivity = (
        engine.get("risk_sensitivity")
        or case.get("riskSensitivity")
        or case.get("risk_sensitivity")
    )
    if isinstance(risk_policy, dict):
        body["risk_policy"] = risk_policy
    if isinstance(desk_policy, dict):
        body["desk_policy"] = desk_policy
    if isinstance(risk_sensitivity, dict):
        body["risk_sensitivity"] = risk_sensitivity
    body["packet_sha256"] = digest(body)
    return body


def _percent_number(value: Any, fallback: Decimal) -> Decimal:
    """Read a percentage defensively from decimal, percent, or display text."""
    if value is None:
        return fallback
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    if not match:
        return fallback
    parsed = Decimal(match.group(0))
    if abs(parsed) <= 1 and "%" not in str(value):
        parsed *= 100
    return parsed


def _vc_risk_context(
    packet: dict[str, Any], loss_hurdle: dict[str, Any]
) -> dict[str, Any]:
    """Return investor-readable risk context across current and future schemas."""
    policy = packet.get("desk_policy")
    if not isinstance(policy, dict):
        policy = packet.get("risk_policy")
    if not isinstance(policy, dict):
        policy = {}
    sensitivity = packet.get("risk_sensitivity")
    if not isinstance(sensitivity, dict):
        sensitivity = {}
    threshold = _percent_number(
        next(
            (
                policy.get("thresholds", {}).get("maximum_probability_below_one")
                if key == "thresholds"
                else policy[key]
                for key in (
                    "thresholds",
                    "maximum_probability_below_one_percent",
                    "maximum_probability_below_one",
                    "loss_probability_threshold_percent",
                    "threshold_percent",
                    "threshold",
                )
                if key in policy
            ),
            loss_hurdle.get("threshold_value"),
        ),
        Decimal("10"),
    )
    label = next(
        (
            str(policy[key])
            for key in ("label", "name", "policy_name", "version")
            if policy.get(key)
        ),
        "Desk-owned draft loss maximum",
    )
    approval = next(
        (
            str(policy[key])
            for key in ("approval_status", "status", "state")
            if policy.get(key)
        ),
        "precommitted synthetic-case threshold",
    )
    sensitivity_summary = next(
        (
            str(sensitivity[key])
            for key in ("decision_summary", "summary", "headline", "interpretation")
            if sensitivity.get(key)
        ),
        "",
    )
    if not sensitivity_summary:
        cells = sensitivity.get("cells") or sensitivity.get("scenarios")
        if isinstance(cells, list):
            sensitivity_summary = f"{len(cells)} retained risk-sensitivity cases are available for review."
    return {
        "threshold_percent": threshold,
        "label": label,
        "approval": approval,
        "sensitivity_summary": sensitivity_summary,
    }


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
        if item["metric_id"] == "helios-selected-catastrophe-prior"
    )
    risk_context = _vc_risk_context(packet, loss_hurdle)
    close_event = next(
        item
        for item in selected["financing_events"]
        if item["event_id"] == "series-c-close"
    )
    first_close_ownership = Decimal(close_event["ownership_numerator"]) / Decimal(
        close_event["ownership_denominator"]
    )
    annual_cash = [
        item for item in selected["cash_by_month"] if item["month"] % 12 == 0
    ]
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
    scenario_labels = {
        "BASE": "Base",
        "MILESTONE": "Milestone-funded",
        "DOWNSIDE": "Downside",
        "FINANCING_SHORTFALL": "Financing shortfall",
    }
    milestone_test_copy = {
        "hx-nrr-metric": lambda item: f"Ordinary-customer NRR is at least {Decimal(item['threshold']) * 100:.1f}% across the trailing twelve months.",
        "hx-margin-metric": lambda item: f"Gross margin is at least {Decimal(item['threshold']) * 100:.1f}% across the trailing three months.",
        "hx-pipeline-audit": lambda item: "The opportunity-stage history is complete as of the test date.",
        "hx-optimizer-replication": lambda item: "The optimizer result has been replicated before the second tranche.",
    }
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
        f"**Binding loss hurdle:** {_percent_number(loss_hurdle['observed_value'], Decimal('20')):.1f}% versus <= {risk_context['threshold_percent']:.1f}%; status `{loss_hurdle['status']}`. The conditional posture is not funding approval while this test and the diligence gates remain open.",
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
            f"| {scenario_labels.get(item['scenario_id'], item['scenario_id'].replace('_', ' ').title())} | {_money(item['target_invested_cents'])} | {Decimal(item['target_ownership']) * 100:.2f}% | {_money(item['minimum_cash_cents'])} | {_money(item['target_proceeds_cents'])} | {_percent(item['gross_xirr'])} | {_multiple(item['gross_moic'])} |"
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
        f"The {_money(packet['milestone_contract']['amount_cents'])} second tranche releases only if every test below passes after a {packet['milestone_contract']['cure_period_days']}-day cure. The board finance committee evaluates the evidence. If any test fails, the tranche is withheld and runway is re-underwritten.",
        "",
        *[
            f"- {milestone_test_copy[item['metric_id']](item)}"
            for item in packet["milestone_contract"]["tests"]
        ],
        "",
        "| Year | Ending cash |",
        "|---:|---:|",
        *[
            f"| {item['month'] // 12} | {_money(item['ending_cash_cents'])} |"
            for item in annual_cash
        ],
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
            for class_id, proceeds in selected["waterfall"][
                "class_proceeds_cents"
            ].items()
        ],
        "",
        f"Series C invests {_money(selected['target_invested_cents'])} in dated funded tranches and receives {_money(selected['target_proceeds_cents'])} at exit: **{_percent(selected['gross_xirr'])} gross XIRR / {_multiple(selected['gross_moic'])} gross MOIC**.",
        "",
        "## Conditional distribution and sensitivity",
        "",
        "The 1,000 retained paths replay the full financing ledger and exact waterfall. They are scenario priors, not a forecast or evidence of real-world accuracy.",
        "",
        "Declared scenario-state priors: "
        + "; ".join(
            f"{name.replace('_', ' ').title()} {_percent(value)}"
            for name, value in packet["distribution"]["template_weights"].items()
        )
        + ".",
        "",
        "| Statistic | p10 | p50 | p90 |",
        "|---|---:|---:|---:|",
        f"| Gross MOIC | {_multiple(packet['distribution']['moic_quantiles'][0])} | {_multiple(packet['distribution']['moic_quantiles'][1])} | {_multiple(packet['distribution']['moic_quantiles'][2])} |",
        f"| Gross XIRR | {_percent(packet['distribution']['xirr_quantiles'][0])} | {_percent(packet['distribution']['xirr_quantiles'][1])} | {_percent(packet['distribution']['xirr_quantiles'][2])} |",
        "",
        f"- Probability below 1.0x: **{_percent(packet['distribution']['probability_below_one'])}** across 1,000 retained scenario paths.",
        f"- Sensitivity book: {len(packet['sensitivities']['cells'])} full-engine cells across exit value, exit date, later-round price, and milestone state.",
        *(
            [
                "",
                "### Risk policy and decision sensitivity",
                "",
                f"{risk_context['label']}: maximum probability below 1.0x of {risk_context['threshold_percent']:.1f}%; state {risk_context['approval']}.",
                *(
                    [risk_context["sensitivity_summary"]]
                    if risk_context["sensitivity_summary"]
                    else []
                ),
            ]
            if "risk_policy" in packet or "risk_sensitivity" in packet
            else []
        ),
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
    selected_annual = [
        item for item in selected["debt_schedule"]["months"] if item["month"] % 12 == 0
    ]
    downside_annual = {
        item["month"]: item
        for item in downside["debt_schedule"]["months"]
        if item["month"] % 12 == 0
    }
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
        f"**Provisional posture:** **{decision['decision']}**",
        f"**Workflow state:** `{decision['status']}` / `{decision['signature_status']}`",
        f"**Knowledge cutoff:** `{decision['as_of']}`",
        f"**Packet receipt:** `{packet['packet_sha256']}`",
        "",
        "## Recommendation",
        "",
        decision["rationale"],
        "",
        "The asking price fails the frozen return hurdle. The selected upfront structure clears the base hurdle while preserving the declared downside floor; open diligence conditions and human IC review still prevent approval.",
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
        f"- Probability below 1.0x MOIC: **{_percent(distribution['probability_below_one'])}** across 1,000 retained scenario paths.",
        f"- Probability of a modeled covenant breach: **{_percent(distribution['probability_covenant_breach'])}** across 1,000 retained scenario paths.",
        f"- Probability of modeled payment default: **{_percent(distribution['probability_payment_default'])}** across 1,000 retained scenario paths.",
        f"- Named downside floor: **{_percent(downside['gross_xirr'])} IRR / {_multiple(downside['gross_moic'])} MOIC**; distributional p10: **{_percent(distribution['xirr_quantiles'][0])} / {_multiple(distribution['moic_quantiles'][0])}**.",
        "",
        "### Entry value × exit multiple sensitivity",
        "",
        "| Entry / exit | 5.5x | 6.5x | 7.5x |",
        "|---|---:|---:|---:|",
        *[
            "| "
            + entry_label
            + " | "
            + " | ".join(
                f"{_percent(next(item for item in matrix if item['assumption_label'] == f'{entry_label} / {exit_label}')['gross_xirr'])} / {_multiple(next(item for item in matrix if item['assumption_label'] == f'{entry_label} / {exit_label}')['gross_moic'])}"
                for exit_label in ("5.5x", "6.5x", "7.5x")
            )
            + " |"
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


def _memo_html(
    markdown: str, packet: dict[str, Any], artifact_kind: str = "packet"
) -> str:
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
            paragraphs.append(
                f"<h2{' class=receipt-title' if compact_receipts else ''}>{inline(line[3:])}</h2>"
            )
        elif line.startswith("### "):
            paragraphs.append(f"<h3>{inline(line[4:])}</h3>")
        elif line.startswith("> "):
            disclosure = line[2:]
            if "SYNTHETIC" in disclosure and "INVESTMENT ADVICE" in disclosure:
                disclosure = "Illustrative synthetic case - not investment advice"
            paragraphs.append(f"<aside>{inline(disclosure)}</aside>")
        elif line.startswith("|---"):
            continue
        elif line.startswith("|"):
            cells = [inline(item.strip()) for item in line.strip("|").split("|")]
            tag = "th" if not in_table else "td"
            if not in_table:
                paragraphs.append("<table><thead>")
            paragraphs.append(
                "<tr>" + "".join(f"<{tag}>{item}</{tag}>" for item in cells) + "</tr>"
            )
            if not in_table:
                paragraphs.append("</thead><tbody>")
                in_table = True
        else:
            if in_table:
                paragraphs.append("</tbody></table>")
                in_table = False
            if line.startswith("- "):
                paragraphs.append(
                    f"<p class='bullet{' receipt-row' if compact_receipts else ''}'>• {inline(line[2:])}</p>"
                )
            elif line:
                paragraphs.append(
                    f"<p{' class=receipt-row' if compact_receipts else ''}>{inline(line)}</p>"
                )
    if in_table:
        paragraphs.append("</tbody></table>")
    style = """
    @page{size:letter;margin:.48in .5in .62in;@bottom-left{content:"Underwriting Desk";font:7.5px Arial,sans-serif;color:#657078}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:7.5px Arial,sans-serif;color:#657078}}
    *{box-sizing:border-box}body{margin:0;color:#20272d;font:10px/1.32 Arial,sans-serif;font-variant-numeric:tabular-nums}h1,h2,h3{font-family:Georgia,serif;font-weight:500;break-after:avoid-page}h1{font-size:25px;line-height:1.08;border-bottom:2px solid #20272d;padding-bottom:9px;margin:0 0 8px}h2{font-size:16px;line-height:1.15;margin:17px 0 6px;border-bottom:1px solid #aeb4b7;padding-bottom:4px}h3{font-size:11.5px;line-height:1.2;margin:10px 0 4px;color:#315f8b}aside{border:1px solid #9b3f31;color:#87382d;padding:5px 8px;font:700 7.5px Arial,sans-serif;letter-spacing:.55px;break-inside:avoid;margin-bottom:6px}p{margin:4px 0;orphans:3;widows:3}p:has(+table),h2:has(+p),h3:has(+p){break-after:avoid-page}.bullet{padding-left:10px}.receipt-title{margin-top:14px}.receipt-row{display:inline-block;width:50%;margin:2px 0;padding-right:8px;font-size:7.5px;line-height:1.2;vertical-align:top}code{font:8px monospace;color:#315f8b;overflow-wrap:anywhere}.receipt-row code{font-size:6.6px}table{width:100%;border-collapse:collapse;margin:6px 0 10px;break-inside:avoid-page;table-layout:fixed}thead{display:table-header-group}th,td{border-bottom:1px solid #ccd0d2;padding:4px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:normal}th{font:700 7.4px Arial,sans-serif;text-transform:uppercase;letter-spacing:.35px;color:#59646b;background:#f3f4f4}td{font-size:8.4px;line-height:1.25}tr{break-inside:avoid}footer{display:block;clear:both;margin-top:8px;border-top:1px solid #20272d;padding-top:4px;font:7.5px Arial,sans-serif;color:#657078;break-inside:avoid}.packet>p:first-of-type{font-weight:600}.atlasgrid-memo.packet,.helios-memo.packet{font-size:9.4px;line-height:1.29}.packet h1{font-size:25px}.packet h2{font-size:15px;margin-top:14px}.packet h3{font-size:11px;margin-top:8px}.packet p{margin:3.5px 0}.packet table{margin:5px 0 8px}.packet th,.packet td{padding:3.5px}.packet td{font-size:7.9px}.technical{font-size:8.3px;line-height:1.23}.technical h1{font-size:22px}.technical h2{font-size:14px;margin-top:13px}.technical h3{font-size:10.5px}.technical table{margin:5px 0 8px}.technical th,.technical td{padding:3px;font-size:6.8px}.technical code{font-size:6.3px;word-break:break-all}@media print{footer{display:none}}@media screen{body{max-width:900px;margin:36px auto;padding:38px;background:#fbf9f4}}
    """
    style += """
    @page{@bottom-left{content:"Underwriting Desk"}}
    aside{border:0;border-top:1px solid #cbd0d2;border-bottom:1px solid #cbd0d2;color:#657078;padding:5px 0;font-weight:600;letter-spacing:.25px}
    """
    body_class = f"{escape(packet['case_id'])}-memo {escape(artifact_kind)}"
    document_label = (
        "technical appendix" if artifact_kind == "technical" else "IC memorandum"
    )
    rendered = f"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{escape(packet['company'])} {document_label}</title><style>{style}</style></head><body class='{body_class}'>{''.join(paragraphs)}<footer>Packet {packet['packet_sha256']} · {escape(packet['disclosure'])}</footer></body></html>"
    return "\n".join(line.rstrip() for line in rendered.splitlines())


def _remove_sections(markdown: str, headings: set[str]) -> str:
    retained: list[str] = []
    skipping = False
    for line in markdown.splitlines():
        if line.startswith("## "):
            skipping = line[3:] in headings
        if not skipping:
            retained.append(line)
    return "\n".join(retained).rstrip() + "\n"


def _remove_subsections(markdown: str, headings: set[str]) -> str:
    retained: list[str] = []
    skipping = False
    for line in markdown.splitlines():
        if line.startswith("## "):
            skipping = False
        elif line.startswith("### "):
            skipping = line[4:] in headings
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
    cleaned = _remove_subsections(cleaned, {"Economic mapping register"})
    lines = [
        line
        for line in cleaned.splitlines()
        if not line.startswith(
            (
                "**Authority:**",
                "**Knowledge cutoff:**",
                "**Packet receipt:**",
                "**Workflow state:**",
            )
        )
    ]
    result = (
        "\n".join(lines).replace("`MISSES`", "Misses").replace("`CLEARS`", "Clears")
    )
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
    for raw, readable in sorted(
        practitioner_terms.items(), key=lambda item: len(item[0]), reverse=True
    ):
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
    metrics = {item["label"]: item for item in case["summaryMetrics"]}
    if case["caseId"] == "atlasgrid":
        engine = case["peEngine"]
        decision_request = (
            "Authorize a counter at a $210M fixed-value cap, retain the $120M debt cap, "
            "and condition any earnout on verified live ARR, retention, and margin quality."
        )
        headline_metrics = [
            (
                "Selected return",
                _percent(engine["selected"]["gross_xirr"]),
                _multiple(engine["selected"]["gross_moic"]),
            ),
            (
                "Seller-ask return",
                _percent(engine["ask"]["gross_xirr"]),
                "below the 22% hurdle",
            ),
            (
                "Downside return",
                _percent(engine["downside"]["gross_xirr"]),
                _multiple(engine["downside"]["gross_moic"]),
            ),
            (
                "Normalized EBITDA",
                metrics["Normalized LTM EBITDA"]["value"],
                metrics["Normalized LTM EBITDA"]["detail"],
            ),
        ]
        evidence_lines = [
            f"Complete-cohort NRR is {metrics['Complete-cohort NRR']['value']} versus {metrics['Complete-cohort NRR']['detail'].lower()}.",
            f"Parent concentration is {metrics['Top-10 parent concentration']['value']} versus {metrics['Top-10 parent concentration']['detail'].lower()}.",
            f"Fully burdened gross margin is {metrics['Fully burdened gross margin']['value']} versus {metrics['Fully burdened gross margin']['detail'].lower()}.",
        ]
    else:
        engine = case["vcEngine"]
        loss_hurdle = next(
            item
            for item in decision["metric_pairs"]
            if item["metric_id"] == "helios-selected-catastrophe-prior"
        )
        package_policy = (
            engine.get("risk_policy")
            or case.get("riskPolicy")
            or case.get("risk_policy")
            or {}
        )
        desk_policy = engine.get("desk_policy") or case.get("deskPolicy") or {}
        packet_like = {
            "risk_policy": package_policy,
            "desk_policy": desk_policy,
        }
        risk_context = _vc_risk_context(packet_like, loss_hurdle)
        decision_request = (
            "HOLD under the selected synthetic prior and Desk-owned draft loss maximum. Do not "
            "authorize funding while diligence remains unresolved; reopen only after human "
            "IC review of the risk specification and new evidence."
        )
        headline_metrics = [
            (
                "Selected catastrophe prior",
                f"{_percent_number(loss_hurdle['observed_value'], Decimal('20')):.1f}%",
                f"Desk loss ceiling {risk_context['threshold_percent']:.1f}%",
            ),
            ("First close", "$25M", "13.51% ownership"),
            ("Conditional tranche", "$15M", "month 12; evidence gated"),
            (
                "Conditional upside",
                _percent(engine["milestone"]["gross_xirr"]),
                f"{_multiple(engine['milestone']['gross_moic'])}; not the recommendation",
            ),
        ]
        evidence_lines = [
            f"Ordinary-cohort NRR is {metrics['Ordinary-cohort NRR']['value']}; {metrics['Ordinary-cohort NRR']['detail'].lower()}.",
            f"Blended gross margin is {metrics['Blended gross margin']['value']}; {metrics['Blended gross margin']['detail'].lower()}.",
            f"Runway is {metrics['Runway']['value']}; {metrics['Runway']['detail'].lower()}.",
        ]
    lines = [
        f"# {case['company']} - IC decision brief",
        "",
        f"> {case['disclosure']}",
        "",
        f"## {decision['decision'].replace('_', ' ')}",
        "",
        decision["rationale"],
        "",
        f"**Decision requested:** {decision_request}",
        "",
        "## Decision at a glance",
        "",
        "| Measure | Result | Context |",
        "|---|---:|---|",
        *[
            f"| {label} | {value} | {context} |"
            for label, value, context in headline_metrics
        ],
        "",
        "## Evidence that changes the call",
        "",
        *[f"- {item}" for item in evidence_lines],
        "",
        "## What must be true",
        "",
        *[
            f"- **{item['title']}** - {item['owner']}. {item['consequence']}"
            for item in issues["issues"][:3]
        ],
        "",
        "## Path to reconsideration",
        "",
        *[f"- {item}" for item in decision["path_to_yes"][:3]],
        "",
        "**Authority:** Requires investment committee approval. No capital action is authorized.",
        "",
        f"Analysis cutoff: {decision['as_of'][:10]}",
        "",
    ]
    return _ascii_dashes("\n".join(lines))


def _bar_row(
    label: str, value: Decimal, maximum: Decimal, display: str, tone: str = ""
) -> str:
    width = max(Decimal("1.5"), min(Decimal("100"), value / maximum * 100))
    rendered = (
        f"<div class='bar-row {escape(tone)}'><div class=bar-label><span>{escape(label)}</span>"
        f"<strong>{escape(display)}</strong></div><div class=bar-track>"
        f"<span class=bar-fill style='width:{width:.2f}%'></span></div></div>"
    )
    return "\n".join(line.rstrip() for line in rendered.splitlines())


def _snapshot_html(case: dict[str, Any], packet: dict[str, Any]) -> str:
    decision = case["decision"]
    issues = decision["issue_summary"]["issues"][:3]
    metrics = {item["label"]: item for item in case["summaryMetrics"]}
    as_of = decision["as_of"][:10]
    if case["caseId"] == "atlasgrid":
        engine = packet["scenarios"]
        action = (
            "Authorize a counter at a $210M fixed-value cap; retain the $120M debt cap; "
            "make contingent value depend on verified live ARR, retention, and margin quality."
        )
        hero_gate = (
            "The seller ask returns "
            f"{_percent(engine['ask']['gross_xirr'])}, below the 22% hurdle. "
            f"The selected structure reaches {_percent(engine['selected']['gross_xirr'])}."
        )
        cards = [
            (
                "Selected return",
                _percent(engine["selected"]["gross_xirr"]),
                _multiple(engine["selected"]["gross_moic"]),
            ),
            ("Seller ask", _percent(engine["ask"]["gross_xirr"]), "Misses 22% IRR"),
            (
                "Named downside",
                _percent(engine["downside"]["gross_xirr"]),
                _multiple(engine["downside"]["gross_moic"]),
            ),
            (
                "Normalized EBITDA",
                metrics["Normalized LTM EBITDA"]["value"],
                "Seller: $34.9M",
            ),
        ]
        return_rows = [
            (
                "Seller ask",
                Decimal(engine["ask"]["gross_xirr"]) * 100,
                _percent(engine["ask"]["gross_xirr"]),
                "warn",
            ),
            (
                "Selected",
                Decimal(engine["selected"]["gross_xirr"]) * 100,
                _percent(engine["selected"]["gross_xirr"]),
                "good",
            ),
            (
                "Downside",
                Decimal(engine["downside"]["gross_xirr"]) * 100,
                _percent(engine["downside"]["gross_xirr"]),
                "risk",
            ),
        ]
        chart_one = (
            "<div class=visual data-visual='scenario-return' role=img "
            "aria-label='Gross IRR: seller ask 17.6 percent, selected 23.3 percent, downside 6.2 percent; hurdle 22 percent.'>"
            "<div class=visual-head><div><h2>Price discipline changes the answer</h2>"
            "<p>Gross IRR by deterministic case</p></div><span class=legend>22% hurdle</span></div>"
            "<div class=bar-chart><span class=hurdle style='left:73.33%'></span>"
            + "".join(
                _bar_row(label, value, Decimal("30"), display, tone)
                for label, value, display, tone in return_rows
            )
            + "</div></div>"
        )
        comparisons = [
            ("Retention", "Active-only 105.5%", "Complete cohort 99.9%"),
            ("Concentration", "Entity view 3.4%", "Parent view 20.4%"),
            ("Gross margin", "Reported 80.5%", "Fully burdened 72.8%"),
            ("EBITDA", "Seller $34.9M", "Normalized $25.9M"),
        ]
        chart_two_title = "The underwriting reset"
        chart_two_caption = "Management framing versus decision-grade definition"
        chart_two_aria = "Reported and underwritten comparisons for retention, concentration, gross margin, and EBITDA."
        chart_two_rows = comparisons
        qualifier = "Synthetic causal estimates recover planted mechanisms only. Scenario outputs are not forecasts."
    else:
        engine = packet["scenarios"]
        loss_hurdle = next(
            item
            for item in decision["metric_pairs"]
            if item["metric_id"] == "helios-selected-catastrophe-prior"
        )
        risk_context = _vc_risk_context(packet, loss_hurdle)
        observed_loss = _percent_number(loss_hurdle["observed_value"], Decimal("20"))
        threshold = Decimal(risk_context["threshold_percent"])
        action = (
            "HOLD under the selected synthetic prior and Desk-owned draft loss maximum. Do not "
            "authorize funding while diligence remains unresolved; reopen only after human "
            "IC review of the risk specification and new evidence."
        )
        hero_gate = (
            f"The selected analyst catastrophe prior is {observed_loss:.1f}% versus a "
            f"{threshold:.1f}% Desk loss ceiling. Every catastrophe path loses in this retained structure; "
            "the replay checks the generator rather than estimating the input."
        )
        close_event = next(
            item
            for item in engine["milestone"]["financing_events"]
            if item["event_id"] == "series-c-close"
        )
        first_close_ownership = Decimal(close_event["ownership_numerator"]) / Decimal(
            close_event["ownership_denominator"]
        )
        cards = [
            ("Selected catastrophe prior", f"{observed_loss:.1f}%", f"Desk ceiling {threshold:.1f}%"),
            ("First close", "$25M", f"{first_close_ownership * 100:.2f}% after close and pool refresh"),
            (
                "Conditional tranche",
                _money(packet["milestone_contract"]["amount_cents"]),
                "Month 12; evidence gated",
            ),
            (
                "Conditional upside",
                _percent(engine["milestone"]["gross_xirr"]),
                f"{_multiple(engine['milestone']['gross_moic'])}; not approval",
            ),
        ]
        meter_max = max(Decimal("30"), observed_loss * Decimal("1.25"))
        marker = max(Decimal("0"), min(Decimal("100"), threshold / meter_max * 100))
        chart_one = (
            "<div class=visual data-visual='loss-policy' role=img "
            f"aria-label='Selected analyst catastrophe prior is {observed_loss:.1f} percent versus a Desk loss ceiling of {threshold:.1f} percent.'>"
            "<div class=visual-head><div><h2>The selected prior exceeds the Desk ceiling</h2>"
            f"<p>{escape(str(risk_context['label']))}; {escape(str(risk_context['approval']))}</p></div>"
            f"<span class=legend>Maximum {threshold:.1f}%</span></div>"
            f"<div class=meter-body><div class=risk-meter><span class=risk-fill style='width:{min(Decimal('100'), observed_loss / meter_max * 100):.2f}%'></span>"
            f"<span class=policy-marker style='left:{marker:.2f}%'></span></div>"
            f"<div class=meter-scale><span>0%</span><strong>Selected input {observed_loss:.1f}%</strong><span>{meter_max:.0f}%</span></div></div></div>"
        )
        scenario_rows = [
            (
                "Base",
                Decimal(engine["base"]["gross_moic"]),
                _multiple(engine["base"]["gross_moic"]),
                "neutral",
            ),
            (
                "Milestone",
                Decimal(engine["milestone"]["gross_moic"]),
                _multiple(engine["milestone"]["gross_moic"]),
                "good",
            ),
            (
                "Downside",
                Decimal(engine["downside"]["gross_moic"]),
                _multiple(engine["downside"]["gross_moic"]),
                "risk",
            ),
            (
                "Shortfall",
                Decimal(engine["financing_shortfall"]["gross_moic"]),
                _multiple(engine["financing_shortfall"]["gross_moic"]),
                "warn",
            ),
        ]
        chart_two_title = "Returns depend on the financing path"
        chart_two_caption = (
            "Gross MOIC; scenario outputs are conditional, not forecasts"
        )
        chart_two_aria = "Gross MOIC: base 6.4, milestone 8.2, downside 1.4, financing shortfall 2.3."
        chart_two_rows = scenario_rows
        qualifier = "The 1,000 paths replay declared synthetic scenario priors. They do not estimate real-world investment accuracy."

    cards_html = "".join(
        f"<div class=stat><span>{escape(label)}</span><strong>{escape(value)}</strong><small>{escape(detail)}</small></div>"
        for label, value, detail in cards
    )
    if case["caseId"] == "atlasgrid":
        chart_two_body = "".join(
            f"<div class=compare-row><strong>{escape(label)}</strong><span>{escape(first)}</span>"
            f"<b aria-hidden=true>→</b><span class=underwritten>{escape(second)}</span></div>"
            for label, first, second in chart_two_rows
        )
    else:
        chart_two_body = (
            "<div class=bar-chart>"
            + "".join(
                _bar_row(label, value, Decimal("10"), display, tone)
                for label, value, display, tone in chart_two_rows
            )
            + "</div>"
        )
    chart_two = (
        f"<div class=visual data-visual='decision-sensitivity' role=img aria-label='{escape(chart_two_aria)}'>"
        f"<div class=visual-head><div><h2>{escape(chart_two_title)}</h2><p>{escape(chart_two_caption)}</p></div></div>"
        f"{chart_two_body}</div>"
    )
    issue_html = "".join(
        f"<li><strong>{escape(item['title'])}</strong><span>{escape(item['owner'])}</span>"
        f"<p>{escape(item['consequence'])}</p></li>"
        for item in issues
    )
    path = "".join(f"<li>{escape(item)}</li>" for item in decision["path_to_yes"][:3])
    style = """
    @page{size:letter;margin:.42in .48in .58in;@bottom-left{content:"Underwriting Desk";font:7.5px Arial,sans-serif;color:#657078}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:7.5px Arial,sans-serif;color:#657078}}
    *{box-sizing:border-box}body{margin:0;color:#20272d;font:10.15px/1.28 Arial,sans-serif;font-variant-numeric:tabular-nums;background:#fff}h1,h2,p{margin:0}h1{font:500 24px/1.03 Georgia,serif;letter-spacing:-.25px}h2{font:600 12px/1.15 Arial,sans-serif}.brief{display:grid;gap:11px;min-height:9.15in;grid-template-rows:auto auto auto minmax(210px,1fr) auto auto}.brief-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:2px solid #20272d;padding-bottom:8px}.eyebrow{font:700 7.5px/1.2 Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;color:#3a5f8a;margin-bottom:4px}.metadata{text-align:right;min-width:175px}.disclosure{display:inline-block;border:1px solid #9b3f31;color:#87382d;padding:4px 7px;font:700 7px/1.15 Arial,sans-serif;letter-spacing:.5px}.as-of{display:block;margin-top:5px;color:#657078;font-size:8px}.decision-band{display:grid;grid-template-columns:1.28fr .72fr;border-left:7px solid #9b3f31;background:#f3f0e9;break-inside:avoid}.decision-copy{padding:10px 12px}.decision-label{font:700 7.5px/1.2 Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;color:#657078}.decision{font:600 26px/1 Georgia,serif;margin:2px 0 5px;color:#87382d}.rationale{font-size:10.5px;line-height:1.3}.decision-request{padding:10px 12px;border-left:1px solid #d5d0c6;background:#faf8f3}.decision-request strong{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.7px;color:#3a5f8a;margin-bottom:4px}.decision-request p{font-weight:600;line-height:1.3}.hero-gate{margin-top:5px;color:#4d565d;font-size:8.5px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;break-inside:avoid}.stat{border-top:3px solid #3a5f8a;background:#f7f8f8;padding:7px 8px;min-height:55px}.stat>span{display:block;color:#657078;font-size:7.5px;text-transform:uppercase;letter-spacing:.45px}.stat>strong{display:block;font:600 17px/1.08 Georgia,serif;margin:3px 0 2px}.stat small{display:block;color:#4d565d;font-size:7.5px;line-height:1.15}.visuals{display:grid;grid-template-columns:1fr 1fr;gap:8px;break-inside:avoid}.visual{border:1px solid #cbd0d2;padding:10px 11px;min-height:210px;display:flex;flex-direction:column}.visual-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px}.visual-head p{color:#657078;font-size:8px;margin-top:3px}.legend{font-size:8px;color:#87382d;border-bottom:2px solid #87382d;white-space:nowrap}.bar-chart{position:relative;flex:1;display:flex;flex-direction:column;justify-content:space-around}.bar-row{margin:6px 0}.bar-label{display:flex;justify-content:space-between;font-size:8.5px;margin-bottom:3px}.bar-track{height:8px;background:#e3e6e7;overflow:hidden}.bar-fill{display:block;height:100%;background:#6c7d89}.bar-row.good .bar-fill{background:#315f8b}.bar-row.warn .bar-fill{background:#a17632}.bar-row.risk .bar-fill{background:#9b3f31}.hurdle{position:absolute;top:0;bottom:0;border-left:1.5px dashed #87382d;z-index:2}.compare-row{display:grid;grid-template-columns:.78fr 1fr 14px 1.15fr;gap:5px;align-items:center;border-top:1px solid #e1dfd9;padding:6px 0;font-size:8.2px;flex:1}.compare-row:first-child{border-top:0}.compare-row>b{text-align:center;color:#657078}.compare-row .underwritten{font-weight:700;color:#244d75}.meter-body{margin:auto 0}.risk-meter{height:30px;background:#e3e6e7;position:relative;margin:0 0 6px}.risk-fill{height:100%;display:block;background:#9b3f31}.policy-marker{position:absolute;top:-8px;bottom:-8px;border-left:3px solid #20272d}.meter-scale{display:flex;justify-content:space-between;font-size:8.5px}.meter-scale strong{color:#87382d}.gates{display:grid;grid-template-columns:1fr .62fr;gap:10px;border-top:2px solid #20272d;padding-top:8px;break-inside:avoid}.gates h2{margin-bottom:5px}.gate-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.gate-list li{border-left:3px solid #a17632;padding-left:7px}.gate-list strong,.gate-list span{display:block}.gate-list strong{font-size:8.7px}.gate-list span{font-size:7.6px;color:#657078;margin:2px 0}.gate-list p{font-size:7.8px;line-height:1.2}.path{border-left:1px solid #cbd0d2;padding-left:11px}.path p{font-size:8.4px;line-height:1.25}.boundary{border-top:1px solid #cbd0d2;padding-top:6px;color:#657078;font-size:7.7px;display:flex;justify-content:space-between;gap:12px}.boundary strong{color:#20272d}@media screen{body{max-width:8.5in;margin:24px auto;padding:.42in .48in;background:#fff;box-shadow:0 2px 18px #0002}}@media print{footer{display:none}}
    @media screen{body{margin:0 auto;padding:10px .48in}}
    """
    style += """
    @page{@bottom-left{content:"Underwriting Desk"}}
    .disclosure{border:0;color:#657078;padding:0;font-weight:600;letter-spacing:.25px}
    .decision-band{border-left-color:#315f8b;background:#f2f4f5}
    .decision{color:#20272d}
    .legend{color:#315f8b;border-bottom-color:#315f8b}
    .bar-row.risk .bar-fill,.risk-fill{background:#7d6848}
    """
    rendered = (
        "<!doctype html><html lang=en><head><meta charset=utf-8>"
        "<meta name=viewport content='width=device-width,initial-scale=1'>"
        f"<title>{escape(case['company'])} IC decision brief</title><style>{style}</style></head>"
        "<body><main class=brief data-decision-brief>"
        f"<header class=brief-head><div><p class=eyebrow>{'Private equity buyout' if case['caseId'] == 'atlasgrid' else 'Venture and growth equity'} | IC decision brief</p>"
        f"<h1>{escape(case['company'])}</h1></div><div class=metadata>"
        f"<aside class=disclosure>Illustrative synthetic case - not investment advice</aside><span class=as-of>Analysis cutoff {escape(as_of)}</span></div></header>"
        f"<section class=decision-band aria-labelledby=decision-heading><div class=decision-copy><p class=decision-label>Recommendation</p>"
        f"<h2 class=decision id=decision-heading>{escape(decision['decision'].replace('_', ' '))}</h2>"
        f"<p class=rationale>{escape(decision['rationale'])}</p></div><div class=decision-request>"
        f"<strong>Decision requested</strong><p>{escape(action)}</p><p class=hero-gate>{escape(hero_gate)}</p></div></section>"
        f"<section class=stats aria-label='Decision economics'>{cards_html}</section>"
        f"<section class=visuals aria-label='Decision visuals'>{chart_one}{chart_two}</section>"
        f"<section class=gates><div><h2>What must be true before advancement</h2><ol class=gate-list>{issue_html}</ol></div>"
        f"<div class=path><h2>Path to reconsideration</h2><ol>{path}</ol></div></section>"
        f"<section class=boundary><span>{escape(qualifier)}</span><strong>Human IC approval required. No capital action is authorized.</strong></section>"
        "</main></body></html>"
    )
    return "\n".join(line.rstrip() for line in rendered.splitlines())


def _technical_appendix_markdown(case: dict[str, Any], packet: dict[str, Any]) -> str:
    def operand_summary(operand_ids: list[str]) -> str:
        if len(operand_ids) <= 6:
            return ", ".join(f"`{operand}`" for operand in operand_ids)
        preview = ", ".join(f"`{operand}`" for operand in operand_ids[:3])
        return (
            f"{preview}; +{len(operand_ids) - 3} more in model-appendix.json "
            f"(ordered-list SHA-256 `{digest(operand_ids)}`)"
        )

    if case["caseId"] == "atlasgrid":
        distribution = packet["distribution"]
        sampling_precision = [
            f"- Probability below 1.0x MOIC: Monte Carlo SE `{distribution['probability_below_one_monte_carlo_se_pp']} pp` (1,000 draws).",
            f"- Modeled covenant-breach probability: Monte Carlo SE `{distribution['probability_covenant_breach_monte_carlo_se_pp']} pp` (1,000 draws).",
            f"- Modeled payment-default probability: Monte Carlo SE `{distribution['probability_payment_default_monte_carlo_se_pp']} pp` (1,000 draws).",
        ]
    else:
        distribution = packet["distribution"]
        sampling_precision = [
            f"- Probability below 1.0x: Monte Carlo SE `{distribution['probability_below_one_monte_carlo_se_pp']} pp` (1,000 draws).",
        ]

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
        *[
            f"| {item['analysis_id']} | {item['classification']} | {item['state']} | `{item['spec_sha256']}` | `{item['receipt_sha256']}` |"
            for item in case["analyses"]
        ],
        "",
        "## Evidence-to-model mappings",
        "",
        "| Analysis | Credit class | Observed value | Model treatment |",
        "|---|---|---|---|",
        *[
            f"| {item['source_analysis_id']} | {item['credit_tier']} | {item['observed_value']} | {item['model_credit']} |"
            for item in case["evidenceMappings"]
        ],
        "",
        "## Formula register",
        "",
        "| Formula | Operation | Output metric | Operands |",
        "|---|---|---|---|",
        *[
            f"| `{item['formula_id']}` | {item['operation']} | `{item['output_metric_id']}` | {operand_summary(item['operand_ids'])} |"
            for item in case["formulaRegistry"]
        ],
        "",
        "## Sampling precision",
        "",
        "These standard errors describe finite simulation sampling error only. They do not measure investment-model accuracy or real-world forecast uncertainty.",
        "",
        *sampling_precision,
        "",
        "## Reproducibility boundary",
        "",
        "All data and results are synthetic. Exact arithmetic, source locators, scenario receipts, and deterministic generation establish internal reproducibility only. They do not establish live-deal accuracy, investment approval, or real-world performance.",
        "",
    ]
    return _ascii_dashes("\n".join(lines))


def build_ic_packet_from_case(
    case: dict[str, Any], output_dir: str | Path
) -> dict[str, Path]:
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
    snapshot_html_path.write_text(_snapshot_html(case, packet), encoding="utf-8")
    packet_md_path.write_text(packet_markdown, encoding="utf-8")
    packet_html_path.write_text(
        _memo_html(packet_markdown, packet, "packet"), encoding="utf-8"
    )
    technical_md_path.write_text(technical_markdown, encoding="utf-8")
    technical_html_path.write_text(
        _memo_html(technical_markdown, packet, "technical"), encoding="utf-8"
    )
    write_json(model_appendix_path, packet)
    artifacts = [
        snapshot_md_path,
        snapshot_html_path,
        packet_md_path,
        packet_html_path,
        technical_md_path,
        technical_html_path,
        model_appendix_path,
    ]
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


def build_ic_packet(
    analysis_path: str | Path, output_dir: str | Path
) -> dict[str, Path]:
    case = json.loads(Path(analysis_path).read_text(encoding="utf-8"))
    return build_ic_packet_from_case(case, output_dir)
