from __future__ import annotations

from decimal import Decimal
from pathlib import Path
import re
from typing import Any

from .contracts import UnderwritingError, digest
from .source_evidence import compile_source_evidence


def _decimal(value: int | str | Decimal) -> str:
    if str(value) in {"ABSTAIN", "NONE"}:
        return str(value)
    return format(Decimal(str(value)), "f")


def _metric(
    *,
    metric_id: str,
    label: str,
    value: int | str | Decimal,
    display_value: str,
    unit: str,
    quantum: str,
    period: str,
    classification: str,
    locator_ids: list[str],
    receipt_sha256: str,
    formula_id: str | None = None,
    operand_ids: list[str] | None = None,
    assumption_ids: list[str] | None = None,
    downstream_ids: list[str] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "metric_id": metric_id,
        "label": label,
        "value": _decimal(value),
        "display_value": display_value,
        "unit": unit,
        "quantum": quantum,
        "currency": "USD" if unit == "cents" else None,
        "period": period,
        "classification": classification,
        "source_locator_ids": locator_ids,
        "formula_id": formula_id,
        "operand_ids": operand_ids or [],
        "assumption_ids": assumption_ids or [],
        "downstream_ids": downstream_ids or [],
        "governing_receipt_sha256": receipt_sha256,
        "state": "CURRENT",
    }
    body["metric_sha256"] = digest(body)
    return body


def _formula(
    formula_id: str,
    operation: str,
    operands: list[str],
    output_metric_id: str,
    output_unit: str,
) -> dict[str, Any]:
    body = {
        "formula_id": formula_id,
        "operation": operation,
        "operand_ids": operands,
        "output_metric_id": output_metric_id,
        "output_unit": output_unit,
    }
    body["formula_sha256"] = digest(body)
    return body


def _money(cents: int) -> str:
    value = (Decimal(abs(cents)) / Decimal(100_000_000)).quantize(Decimal("0.1"))
    if value == 0:
        return "$0"
    sign = "−" if cents < 0 else ""
    return f"{sign}${value}M".replace(".0M", "M")


def _percent(decimal_value: str) -> str:
    return f"{(Decimal(decimal_value) * 100).quantize(Decimal('0.1'))}%"


def _multiple(decimal_value: str) -> str:
    return f"{Decimal(decimal_value).quantize(Decimal('0.01'))}x"


def build_case_metric_contract(
    case: dict[str, Any], *, source_root: Path
) -> dict[str, Any]:
    """Compile stable source, metric, formula, and render inventories.

    The registry contains exact values. Formatting is retained separately so the
    browser never has to infer an underwriting value from presentation text.
    """

    source_locators, locators_by_analysis = compile_source_evidence(case, source_root)
    lineage_by_id = {item["node_id"]: item for item in case["lineage"]}

    def locators_for_lineage(lineage_ids: list[str]) -> list[str]:
        return list(
            dict.fromkeys(
                locator_id
                for lineage_id in lineage_ids
                for locator_id in locators_by_analysis[
                    lineage_by_id[lineage_id]["analysis_id"]
                ]
            )
        )

    metrics: list[dict[str, Any]] = []
    formulas: list[dict[str, Any]] = []
    render_ids: list[str] = []

    def add(**kwargs: Any) -> None:
        item = _metric(**kwargs)
        metrics.append(item)
        render_ids.append(item["metric_id"])

    for summary in case["summaryMetrics"]:
        lineage_ids = summary["lineage"]
        match = re.search(r"-?[0-9]+(?:\.[0-9]+)?", summary["value"])
        try:
            numeric = Decimal(match.group(0)) if match else None
        except Exception as exc:  # pragma: no cover - contract fail closed
            raise UnderwritingError(f"summary_metric_not_numeric:{summary['metric_id']}") from exc
        if numeric is None:
            raise UnderwritingError(f"summary_metric_not_numeric:{summary['metric_id']}")
        special: dict[str, Any] = {}
        if case["caseId"] == "atlasgrid" and summary["metric_id"] == "ag-return":
            selected = case["peEngine"]["selected"]
            special = {
                "value": selected["gross_xirr"],
                "unit": "decimal_rate",
                "quantum": "0.00000000000001",
                "formula_id": "pe-formula-headline-dated-xirr",
                "operand_ids": [
                    f"atlasgrid-{selected['scenario_id']}-sponsor-cash-flow-{index:02d}"
                    for index, _ in enumerate(selected["sponsor_cash_flows"], start=1)
                ],
            }
        elif case["caseId"] == "helios" and summary["metric_id"] == "hx-ownership":
            special = {
                "value": case["vcEngine"]["milestone"]["target_ownership"],
                "unit": "decimal_rate",
                "quantum": "0.00000001",
                "formula_id": "vc-formula-headline-ownership",
                "operand_ids": [
                    "helios-MILESTONE-target-shares",
                    "helios-MILESTONE-fully-diluted-shares",
                ],
            }
        add(
            metric_id=summary["metric_id"], label=summary["label"], value=special.pop("value", numeric),
            display_value=summary["value"], unit=special.pop("unit", "display_native"), quantum=special.pop("quantum", "0.01"),
            period=case["decision"].get("as_of", "NOT_APPLICABLE"),
            classification=summary["classification"],
            locator_ids=locators_for_lineage(lineage_ids),
            receipt_sha256=case["analysis_sha256"] if "analysis_sha256" in case else case["manifest_sha256"],
            downstream_ids=["decision"],
            **special,
        )

    # Every analysis output receives one deterministic registry identifier. This
    # closes the audit gap between receipt-backed values and the values rendered
    # in the econometric and lineage drawers.
    for receipt in case["analyses"]:
        analysis_id = receipt["analysis_id"]
        for output in receipt["outputs"]:
            output_name = output["name"]
            locator_ids = list(locators_by_analysis[analysis_id])
            if not locator_ids:
                raise UnderwritingError(
                    f"analysis_output_lineage_missing:{analysis_id}:{output_name}"
                )
            value = output["value"]
            numeric_match = re.fullmatch(r"-?[0-9]+(?:\.[0-9]+)?", value)
            if numeric_match and "." in value:
                decimal_places = len(value.rsplit(".", maxsplit=1)[1])
                quantum = f"0.{('0' * (decimal_places - 1))}1"
            else:
                quantum = "1"
            classification = receipt["classification"]
            if value == "ABSTAIN":
                classification = "NOT_IDENTIFIED"
            add(
                metric_id=f"{case['caseId']}-{analysis_id.lower()}-{output_name}",
                label=output_name.replace("_", " ").title(),
                value=value,
                display_value=(
                    value
                    if value in {"ABSTAIN", "NONE"}
                    else f"{value} {output['unit']}"
                ),
                unit=output["unit"],
                quantum=quantum,
                period=receipt["cutoff"],
                classification=classification,
                locator_ids=locator_ids,
                receipt_sha256=receipt["receipt_sha256"],
                assumption_ids=(
                    [f"{analysis_id}.declared_assumptions"]
                    if receipt["assumptions"]
                    else []
                ),
                downstream_ids=["decision"],
            )

    engine = case.get("peEngine")
    if engine is not None:
        for scenario_key in ("ask", "selected", "downside"):
            result = engine[scenario_key]
            scenario_id = result["scenario_id"]
            receipt = result["receipt_sha256"]
            base = f"{case['caseId']}-{scenario_id}"
            sources = result["sources_and_uses"]
            transaction = result["engine_inputs"]["transaction"]
            debt = result["debt_schedule"]
            period = f"{result['engine_inputs']['close_date']} through month 60"
            common = {
                "period": period,
                "classification": "SCENARIO",
                "locator_ids": list(locators_by_analysis["AG-10"]),
                "receipt_sha256": receipt,
                "assumption_ids": [f"{scenario_id}.engine_inputs"],
                "downstream_ids": ["decision"],
            }

            def add_cents(metric_id: str, label: str, value: int, display: str | None = None, **extra: Any) -> None:
                add(metric_id=metric_id, label=label, value=value, display_value=display or _money(value), unit="cents", quantum="1", **common, **extra)

            add_cents(f"{base}-entry", "Upfront EV", sources["uses_cents"]["cash_enterprise_value"])
            add_cents(f"{base}-max-bid", "Maximum bid", engine["maximum_bid_cents"])
            threshold = int(transaction.get("earnout_threshold_arr_cents") or 0)
            cap = int(transaction.get("earnout_cap_cents") or 0)
            add_cents(f"{base}-earnout-threshold", "Earnout threshold", threshold)
            add_cents(f"{base}-earnout-cap", "Earnout cap", cap)
            add(
                metric_id=f"{base}-earnout-terms", label="Earnout threshold / cap", value=threshold,
                display_value=f"{_money(threshold)} / {_money(cap)}", unit="cents_pair", quantum="1",
                **common,
            )
            add_cents(f"{base}-debt-funded", "Funded term debt", int(transaction["funded_term_face_cents"]))
            for side, values in (("uses", sources["uses_cents"]), ("sources", sources["non_sponsor_sources_cents"])):
                for name, value in values.items():
                    add_cents(f"{base}-{side}-{name}", name.replace("_", " "), int(value))
            add_cents(f"{base}-sources-sponsor-equity", "Sponsor equity", sources["sponsor_equity_cents"])
            add_cents(f"{base}-total-uses", "Total uses", sources["total_uses_cents"])
            add_cents(f"{base}-total-sources", "Total sources", sources["total_sources_cents"])
            add_cents(f"{base}-undrawn-revolver", "Undrawn revolver", sources["undrawn_revolver_commitment_cents"])
            add_cents(f"{base}-sources-reconcile", "Reconciliation", sources["total_sources_cents"] - sources["total_uses_cents"], "$0 residual")
            add_cents(f"{base}-exit-debt", "Exit debt", debt["ending_debt_cents"])
            add_cents(f"{base}-min-liquidity", "Minimum liquidity", debt["minimum_liquidity_cents"])
            min_headroom = min(Decimal(item["covenant_headroom"]) for item in debt["months"])
            add(metric_id=f"{base}-min-headroom", label="Minimum headroom", value=min_headroom, display_value=_multiple(str(min_headroom)), unit="turns", quantum="0.01", **common)
            add_cents(f"{base}-exit-ev", "Exit enterprise value", result["exit_enterprise_value_cents"])
            final_cash = debt["months"][-1]["ending_cash_cents"]
            add_cents(f"{base}-exit-cash", "Exit cash", final_cash)
            add_cents(f"{base}-exit-equity", "Exit equity", result["exit_equity_value_cents"])
            add(metric_id=f"{base}-gross-irr", label="Gross IRR", value=result["gross_xirr"], display_value=_percent(result["gross_xirr"]), unit="decimal_rate", quantum="0.0001", **common)
            add(metric_id=f"{base}-gross-moic", label="Gross MOIC", value=result["gross_moic"], display_value=_multiple(result["gross_moic"]), unit="multiple", quantum="0.0001", **common)
            add_cents(f"{base}-earnout", "Earnout paid", result["earnout_cents"])

            if scenario_key == "selected":
                sponsor_cash_flow_ids: list[str] = []
                for index, flow in enumerate(result["sponsor_cash_flows"], start=1):
                    metric_id = f"{base}-sponsor-cash-flow-{index:02d}"
                    add(
                        metric_id=metric_id,
                        label=f"Sponsor dated cash flow {index}",
                        value=flow["amount_cents"],
                        display_value=_money(flow["amount_cents"]),
                        unit="cents",
                        quantum="1",
                        period=flow["date"],
                        classification="SCENARIO",
                        locator_ids=list(locators_by_analysis["AG-10"]),
                        receipt_sha256=receipt,
                        assumption_ids=[f"{scenario_id}.engine_inputs"],
                        downstream_ids=["ag-return", "decision"],
                    )
                    sponsor_cash_flow_ids.append(metric_id)
                formulas.append(
                    _formula(
                        "pe-formula-headline-dated-xirr",
                        "DATED_XIRR",
                        sponsor_cash_flow_ids,
                        "ag-return",
                        "decimal_rate",
                    )
                )

            for month in debt["months"]:
                month_id = f"{base}-month-{month['month']:02d}"
                for field in ("ending_cash_cents", "ending_term_cents", "ending_revolver_cents", "cash_interest_cents", "optional_sweep_cents"):
                    add_cents(f"{month_id}-{field}", field.replace("_cents", "").replace("_", " "), month[field])
                for field in ("gross_leverage", "covenant_headroom"):
                    add(metric_id=f"{month_id}-{field}", label=field.replace("_", " "), value=month[field], display_value=_multiple(month[field]), unit="turns", quantum="0.01", **common)

            # Ten exact browser-recomputable binary identities are carried by
            # the selected state; the same outputs remain receipt-bound in Python.
            if scenario_key == "selected":
                formula_specs = [
                    ("uses-1", "ADD", f"{base}-uses-cash_enterprise_value", f"{base}-uses-transaction_fees", sources["uses_cents"]["cash_enterprise_value"] + sources["uses_cents"]["transaction_fees"]),
                    ("uses-2", "ADD", f"{base}-formula-uses-1", f"{base}-uses-financing_fees", sources["uses_cents"]["cash_enterprise_value"] + sources["uses_cents"]["transaction_fees"] + sources["uses_cents"]["financing_fees"]),
                    ("uses-3", "ADD", f"{base}-formula-uses-2", f"{base}-uses-minimum_cash", sources["total_uses_cents"]),
                    ("sources-1", "ADD", f"{base}-sources-funded_term_debt_net_oid", f"{base}-sources-seller_rollover", sources["non_sponsor_sources_cents"]["funded_term_debt_net_oid"] + sources["non_sponsor_sources_cents"]["seller_rollover"]),
                    ("sources-2", "ADD", f"{base}-formula-sources-1", f"{base}-sources-sponsor-equity", sources["total_sources_cents"]),
                    ("exit-debt", "ADD", f"{base}-month-60-ending_term_cents", f"{base}-month-60-ending_revolver_cents", debt["ending_debt_cents"]),
                    ("exit-net", "SUBTRACT", f"{base}-exit-ev", f"{base}-exit-debt", result["exit_enterprise_value_cents"] - debt["ending_debt_cents"]),
                    ("exit-equity", "ADD", f"{base}-formula-exit-net", f"{base}-exit-cash", result["exit_equity_value_cents"]),
                    ("sources-less-uses", "SUBTRACT", f"{base}-total-sources", f"{base}-total-uses", 0),
                    ("liquidity-headroom", "SUBTRACT", f"{base}-min-liquidity", f"{base}-uses-minimum_cash", debt["minimum_liquidity_cents"] - sources["uses_cents"]["minimum_cash"]),
                ]
                for short_id, operation, left, right, value in formula_specs:
                    output_id = f"{base}-formula-{short_id}"
                    formula_id = f"formula-{short_id}"
                    add_cents(output_id, short_id.replace("-", " "), value, formula_id=formula_id, operand_ids=[left, right])
                    formulas.append(_formula(formula_id, operation, [left, right], output_id, "cents"))

        distribution = engine["distribution"]
        distribution_common = {
            "period": "conditional close-through-exit paths", "classification": "SCENARIO",
            "locator_ids": list(locators_by_analysis["AG-11"]),
            "receipt_sha256": distribution["receipt_sha256"],
            "assumption_ids": ["pe-correlation-structure"], "downstream_ids": ["decision"],
        }
        for index, value in enumerate(distribution["moic_quantiles"]):
            add(metric_id=f"{case['caseId']}-distribution-{index}", label=f"{['p10', 'p50', 'p90'][index]} conditional MOIC", value=value, display_value=_multiple(value), unit="multiple", quantum="0.01", **distribution_common)

        for cell in engine["sensitivities"]["one_way"] + engine["sensitivities"]["entry_exit_matrix"]:
            common = {
                "period": "close through month 60", "classification": "SCENARIO",
                "locator_ids": list(locators_by_analysis["AG-10"]),
                "receipt_sha256": cell["receipt_sha256"],
                "assumption_ids": [cell["cell_id"]], "downstream_ids": ["decision"],
            }
            prefix = f"{case['caseId']}-{cell['cell_id']}"
            add(metric_id=f"{prefix}-irr", label="Gross IRR", value=cell["gross_xirr"], display_value=_percent(cell["gross_xirr"]), unit="decimal_rate", quantum="0.0001", **common)
            add(metric_id=f"{prefix}-moic", label="Gross MOIC", value=cell["gross_moic"], display_value=_multiple(cell["gross_moic"]), unit="multiple", quantum="0.0001", **common)
            add(metric_id=f"{prefix}-debt", label="Exit debt", value=cell["ending_debt_cents"], display_value=_money(cell["ending_debt_cents"]), unit="cents", quantum="1", **common)
            add(metric_id=f"{prefix}-headroom", label="Minimum headroom", value=cell["minimum_covenant_headroom"], display_value=_multiple(cell["minimum_covenant_headroom"]), unit="turns", quantum="0.01", **common)
            add(metric_id=f"{prefix}-matrix", label=cell["assumption_label"], value=cell["gross_xirr"], display_value=f"{_percent(cell['gross_xirr'])} / {_multiple(cell['gross_moic'])}", unit="return_pair", quantum="0.0001", **common)

        bridge = case["valueCreationBridge"]
        bridge_common = {
            "period": "close through month 60", "classification": "SCENARIO",
            "locator_ids": locators_for_lineage(
                ["ag-nrr", "ag-support", "ag-margin"]
            ),
            "receipt_sha256": bridge["receipt_sha256"], "assumption_ids": ["value-creation-book"],
            "downstream_ids": ["decision"],
        }
        add(metric_id="atlasgrid-value-combined", label="Combined value-creation impact", value=bridge["combined_exit_equity_delta_cents"], display_value=_money(bridge["combined_exit_equity_delta_cents"]), unit="cents", quantum="1", **bridge_common)
        add(metric_id="atlasgrid-value-interaction", label="Value-creation interaction residual", value=bridge["interaction_residual_cents"], display_value=_money(bridge["interaction_residual_cents"]), unit="cents", quantum="1", **bridge_common)
        for lever in bridge["standalone"]:
            for field in ("exit_ebitda_delta_cents", "exit_debt_delta_cents", "exit_equity_delta_cents", "implementation_cost_cents"):
                add(metric_id=f"atlasgrid-value-{lever['lever_id']}-{field}", label=f"{lever['label']} {field}", value=lever[field], display_value=_money(lever[field]), unit="cents", quantum="1", **bridge_common)
            add(metric_id=f"atlasgrid-value-{lever['lever_id']}-gross_xirr_delta", label=f"{lever['label']} gross IRR impact", value=lever["gross_xirr_delta"], display_value=_percent(lever["gross_xirr_delta"]), unit="decimal_rate", quantum="0.0001", **bridge_common)

    vc_engine = case.get("vcEngine")
    if vc_engine is not None:
        pipeline_receipt = next(
            item for item in case["analyses"] if item["analysis_id"] == "HX-04"
        )
        optimizer_receipt = next(
            item for item in case["analyses"] if item["analysis_id"] == "HX-06"
        )
        add(
            metric_id="hx-pipeline-audit",
            label="Pipeline stage-history audit completion",
            value=1,
            display_value="COMPLETE",
            unit="binary_state",
            quantum="1",
            period="as of underwriting cutoff",
            classification="DESCRIPTIVE",
            locator_ids=list(locators_by_analysis["HX-04"]),
            receipt_sha256=pipeline_receipt["receipt_sha256"],
            assumption_ids=["complete_stage_history_audit"],
            downstream_ids=["series-c-tranche"],
        )
        formulas.append(
            _formula(
                "vc-formula-headline-ownership",
                "DIVIDE",
                ["helios-MILESTONE-target-shares", "helios-MILESTONE-fully-diluted-shares"],
                "hx-ownership",
                "decimal_rate",
            )
        )
        add(
            metric_id="hx-optimizer-replication",
            label="Production optimizer replication",
            value=0,
            display_value="OPEN — NOT REPLICATED",
            unit="binary_state",
            quantum="1",
            period="pre-tranche condition",
            classification="SCENARIO",
            locator_ids=list(locators_by_analysis["HX-06"]),
            receipt_sha256=optimizer_receipt["receipt_sha256"],
            assumption_ids=["production_replication_required"],
            downstream_ids=["series-c-tranche"],
        )
        for scenario_key in ("base", "milestone", "downside", "financing_shortfall"):
            result = vc_engine[scenario_key]
            scenario_id = result["scenario_id"]
            prefix = f"helios-{scenario_id}"
            receipt = result["receipt_sha256"]
            common = {
                "period": "projection origin through month 60",
                "classification": "SCENARIO",
                "locator_ids": locators_for_lineage(
                    ["hx-ownership", "hx-runway", "hx-return"]
                ),
                "receipt_sha256": receipt,
                "assumption_ids": [f"{scenario_id}.engine_inputs"],
                "downstream_ids": ["decision"],
            }

            def add_vc_cents(
                metric_id: str,
                label: str,
                value: int,
                display: str | None = None,
                **extra: Any,
            ) -> None:
                add(
                    metric_id=metric_id,
                    label=label,
                    value=value,
                    display_value=display or _money(value),
                    unit="cents",
                    quantum="1",
                    **common,
                    **extra,
                )

            exit_bridge = result["engine_inputs"]["exit_valuation"]
            if not isinstance(exit_bridge, dict):
                raise UnderwritingError("vc_metric_exit_bridge_missing")
            add_vc_cents(f"{prefix}-bridge-observed-ltm-revenue", "Observed LTM revenue", int(exit_bridge["observed_ltm_revenue_cents"]))
            add(
                metric_id=f"{prefix}-bridge-annual-growth", label="Annual revenue growth", value=exit_bridge["annual_revenue_growth"],
                display_value=_percent(exit_bridge["annual_revenue_growth"]), unit="decimal_rate", quantum="0.01", **common,
            )
            add(
                metric_id=f"{prefix}-bridge-hold-years", label="Hold period", value=exit_bridge["years"],
                display_value=f"{exit_bridge['years']} years", unit="years", quantum="1", **common,
            )
            add_vc_cents(f"{prefix}-bridge-terminal-revenue", "Terminal revenue", int(exit_bridge["terminal_revenue_cents"]))
            add(
                metric_id=f"{prefix}-bridge-exit-multiple", label="Exit revenue multiple", value=exit_bridge["exit_revenue_multiple"],
                display_value=_multiple(exit_bridge["exit_revenue_multiple"]), unit="multiple", quantum="0.01", **common,
            )
            exit_ev_formula = f"vc-formula-{scenario_id.lower()}-bridge-exit-ev"
            add_vc_cents(
                f"{prefix}-bridge-exit-enterprise-value", "Exit enterprise value", int(exit_bridge["exit_enterprise_value_cents"]),
                formula_id=exit_ev_formula,
                operand_ids=[f"{prefix}-bridge-terminal-revenue", f"{prefix}-bridge-exit-multiple"],
            )
            add_vc_cents(f"{prefix}-bridge-exit-cash", "Modeled exit cash", int(exit_bridge["cash_at_exit_cents"]))
            exit_equity_formula = f"vc-formula-{scenario_id.lower()}-bridge-exit-equity"
            add_vc_cents(
                f"{prefix}-bridge-exit-equity", "Exit equity value", int(exit_bridge["exit_equity_value_cents"]),
                formula_id=exit_equity_formula,
                operand_ids=[f"{prefix}-bridge-exit-enterprise-value", f"{prefix}-bridge-exit-cash"],
            )
            formulas.extend(
                [
                    _formula(
                        exit_ev_formula,
                        "MULTIPLY",
                        [f"{prefix}-bridge-terminal-revenue", f"{prefix}-bridge-exit-multiple"],
                        f"{prefix}-bridge-exit-enterprise-value",
                        "cents",
                    ),
                    _formula(
                        exit_equity_formula,
                        "ADD",
                        [f"{prefix}-bridge-exit-enterprise-value", f"{prefix}-bridge-exit-cash"],
                        f"{prefix}-bridge-exit-equity",
                        "cents",
                    ),
                ]
            )

            scenario_label = scenario_id.replace("_", " ").title()
            funded_target_operand_ids = [
                f"{prefix}-event-{event['event_id']}-new-money"
                for event in result["financing_events"]
                if event["holder_id"] == "series-c-investor"
            ]
            funded_capital_formula = f"vc-formula-{scenario_id.lower()}-funded-capital"
            add_vc_cents(
                f"{prefix}-target-invested",
                f"{scenario_label} · Series C funded capital",
                result["target_invested_cents"],
                formula_id=funded_capital_formula,
                operand_ids=funded_target_operand_ids,
            )
            add_vc_cents(f"{prefix}-target-proceeds", "Series C exit proceeds", result["target_proceeds_cents"])
            add_vc_cents(f"{prefix}-minimum-cash", "Minimum modeled cash", result["minimum_cash_cents"])
            waterfall_operand_ids = [f"{prefix}-waterfall-common"] + [
                f"{prefix}-waterfall-{class_id.lower()}-proceeds"
                for class_id in result["waterfall"]["class_proceeds_cents"]
            ]
            waterfall_formula = f"vc-formula-{scenario_id.lower()}-waterfall-conservation"
            add_vc_cents(
                f"{prefix}-exit-value",
                "Exit equity value",
                result["waterfall"]["exit_value_cents"],
                formula_id=waterfall_formula,
                operand_ids=waterfall_operand_ids,
            )
            target_holder = next(
                item for item in result["holders"] if item["holder_id"] == "series-c-investor"
            )
            fully_diluted_shares = (
                sum(int(item["shares"]) for item in result["holders"])
                + int(result["unissued_pool_shares"])
            )
            add(
                metric_id=f"{prefix}-fully-diluted-shares",
                label="Fully diluted shares",
                value=fully_diluted_shares,
                display_value=f"{fully_diluted_shares:,}",
                unit="shares",
                quantum="1",
                **common,
            )
            ownership_formula = f"vc-formula-{scenario_id.lower()}-ownership"
            add(
                metric_id=f"{prefix}-ownership",
                label=f"{scenario_label} · Series C fully diluted ownership",
                value=result["target_ownership"],
                display_value=_percent(result["target_ownership"]),
                unit="decimal_rate",
                quantum="0.00000001",
                formula_id=ownership_formula,
                operand_ids=[
                    f"{prefix}-target-shares",
                    f"{prefix}-fully-diluted-shares",
                ],
                **common,
            )
            moic_formula = f"vc-formula-{scenario_id.lower()}-moic"
            add(
                metric_id=f"{prefix}-gross-moic",
                label="Series C gross MOIC",
                value=result["gross_moic"],
                display_value=_multiple(result["gross_moic"]),
                unit="multiple",
                quantum="0.0001",
                formula_id=moic_formula,
                operand_ids=[
                    f"{prefix}-target-proceeds",
                    f"{prefix}-target-invested",
                ],
                **common,
            )
            cash_flow_operand_ids: list[str] = []
            for flow_index, flow in enumerate(result["target_cash_flows"], start=1):
                flow_metric_id = f"{prefix}-target-cash-flow-{flow_index:02d}"
                flow_common = {**common, "period": flow["date"]}
                add(
                    metric_id=flow_metric_id,
                    label=f"Series C dated cash flow {flow_index}",
                    value=flow["amount_cents"],
                    display_value=_money(flow["amount_cents"]),
                    unit="cents",
                    quantum="1",
                    **flow_common,
                )
                cash_flow_operand_ids.append(flow_metric_id)
            xirr_formula = f"vc-formula-{scenario_id.lower()}-dated-xirr"
            add(
                metric_id=f"{prefix}-gross-xirr",
                label=f"{scenario_label} · Series C gross XIRR",
                value=result["gross_xirr"],
                display_value=_percent(result["gross_xirr"]),
                unit="decimal_rate",
                quantum="0.00000000000001",
                formula_id=xirr_formula,
                operand_ids=cash_flow_operand_ids,
                **common,
            )
            add(
                metric_id=f"{prefix}-unissued-pool",
                label="Unissued option pool",
                value=result["unissued_pool_shares"],
                display_value=f"{result['unissued_pool_shares']:,} shares",
                unit="shares",
                quantum="1",
                **common,
            )
            add(
                metric_id=f"{prefix}-target-shares",
                label="Series C investor shares",
                value=target_holder["shares"],
                display_value=f"{target_holder['shares']:,}",
                unit="shares",
                quantum="1",
                **common,
            )
            formulas.extend(
                [
                    _formula(
                        funded_capital_formula,
                        "SUM",
                        funded_target_operand_ids,
                        f"{prefix}-target-invested",
                        "cents",
                    ),
                    _formula(
                        ownership_formula,
                        "DIVIDE",
                        [
                            f"{prefix}-target-shares",
                            f"{prefix}-fully-diluted-shares",
                        ],
                        f"{prefix}-ownership",
                        "decimal_rate",
                    ),
                    _formula(
                        moic_formula,
                        "DIVIDE",
                        [
                            f"{prefix}-target-proceeds",
                            f"{prefix}-target-invested",
                        ],
                        f"{prefix}-gross-moic",
                        "multiple",
                    ),
                    _formula(
                        xirr_formula,
                        "DATED_XIRR",
                        cash_flow_operand_ids,
                        f"{prefix}-gross-xirr",
                        "decimal_rate",
                    ),
                ]
            )
            for holder in result["holders"]:
                add(
                    metric_id=f"{prefix}-holder-{holder['holder_id']}-shares",
                    label=f"{holder['holder_id']} issued shares",
                    value=holder["shares"],
                    display_value=f"{holder['shares']:,}",
                    unit="shares",
                    quantum="1",
                    **common,
                )
            for preference in result["preferences"]:
                add_vc_cents(
                    f"{prefix}-preference-{preference['class_id'].lower()}-invested",
                    f"{preference['class_id']} invested preference",
                    preference["invested_cents"],
                )
            for event in result["financing_events"]:
                event_prefix = f"{prefix}-event-{event['event_id']}"
                add_vc_cents(f"{event_prefix}-new-money", "Funded cash", event["new_money_cents"])
                for field in (
                    "new_shares",
                    "pool_top_up_shares",
                    "issued_shares_after",
                    "unissued_pool_after",
                    "fully_diluted_after",
                ):
                    add(
                        metric_id=f"{event_prefix}-{field}",
                        label=field.replace("_", " "),
                        value=event[field],
                        display_value=f"{event[field]:,}",
                        unit="shares",
                        quantum="1",
                        **common,
                    )
            formula_months = {1, 12, 24, 36, 60} if scenario_key == "milestone" else set()
            for row in result["cash_by_month"]:
                month_prefix = f"{prefix}-month-{row['month']:02d}"
                for field in (
                    "beginning_cash_cents",
                    "financing_cash_cents",
                    "operating_net_cash_flow_cents",
                    "ending_cash_cents",
                ):
                    add_vc_cents(
                        f"{month_prefix}-{field}",
                        field.replace("_cents", "").replace("_", " "),
                        row[field],
                    )
                if row["month"] in formula_months:
                    intermediate_id = f"{month_prefix}-cash-before-operations"
                    first_formula = f"vc-formula-{scenario_id.lower()}-{row['month']:02d}-funding"
                    second_formula = f"vc-formula-{scenario_id.lower()}-{row['month']:02d}-ending"
                    intermediate_value = row["beginning_cash_cents"] + row["financing_cash_cents"]
                    add_vc_cents(
                        intermediate_id,
                        "cash before operations",
                        intermediate_value,
                        formula_id=first_formula,
                        operand_ids=[
                            f"{month_prefix}-beginning_cash_cents",
                            f"{month_prefix}-financing_cash_cents",
                        ],
                    )
                    formulas.append(
                        _formula(
                            first_formula,
                            "ADD",
                            [
                                f"{month_prefix}-beginning_cash_cents",
                                f"{month_prefix}-financing_cash_cents",
                            ],
                            intermediate_id,
                            "cents",
                        )
                    )
                    ending_id = f"{month_prefix}-ending-cash-recomputed"
                    add_vc_cents(
                        ending_id,
                        "ending cash recomputed",
                        row["ending_cash_cents"],
                        formula_id=second_formula,
                        operand_ids=[intermediate_id, f"{month_prefix}-operating_net_cash_flow_cents"],
                    )
                    formulas.append(
                        _formula(
                            second_formula,
                            "ADD",
                            [intermediate_id, f"{month_prefix}-operating_net_cash_flow_cents"],
                            ending_id,
                            "cents",
                        )
                    )
            waterfall = result["waterfall"]
            add_vc_cents(f"{prefix}-waterfall-common", "Common proceeds", waterfall["common_proceeds_cents"])
            for class_id, proceeds in waterfall["class_proceeds_cents"].items():
                add_vc_cents(
                    f"{prefix}-waterfall-{class_id.lower()}-proceeds",
                    f"{class_id} proceeds",
                    proceeds,
                )
            formulas.append(
                _formula(
                    waterfall_formula,
                    "SUM",
                    waterfall_operand_ids,
                    f"{prefix}-exit-value",
                    "cents",
                )
            )

        distribution = vc_engine["distribution"]
        distribution_common = {
            "period": "conditional close-through-exit paths",
            "classification": "SCENARIO",
            "locator_ids": list(locators_by_analysis["HX-09"]),
            "receipt_sha256": distribution["receipt_sha256"],
            "assumption_ids": ["vc-distribution-priors"],
            "downstream_ids": ["decision"],
        }
        for index, value in enumerate(distribution["moic_quantiles"]):
            add(
                metric_id=f"helios-distribution-moic-{index}",
                label=f"{['p10', 'p50', 'p90'][index]} conditional MOIC",
                value=value,
                display_value=_multiple(value),
                unit="multiple",
                quantum="0.01",
                **distribution_common,
            )
        for index, value in enumerate(distribution["xirr_quantiles"]):
            add(
                metric_id=f"helios-distribution-xirr-{index}",
                label=f"{['p10', 'p50', 'p90'][index]} conditional XIRR",
                value=value,
                display_value=_percent(value),
                unit="decimal_rate",
                quantum="0.0001",
                **distribution_common,
            )
        for cell in vc_engine["sensitivities"]["cells"]:
            common = {
                "period": "projection origin through selected exit",
                "classification": "SCENARIO",
                "locator_ids": locators_for_lineage(["hx-return", "hx-runway"]),
                "receipt_sha256": cell["receipt_sha256"],
                "assumption_ids": [cell["cell_id"]],
                "downstream_ids": ["decision"],
            }
            prefix = f"helios-{cell['cell_id']}"
            add(metric_id=f"{prefix}-gross-moic", label="Gross MOIC", value=cell["gross_moic"], display_value=_multiple(cell["gross_moic"]), unit="multiple", quantum="0.0001", **common)
            add(metric_id=f"{prefix}-gross-xirr", label="Gross XIRR", value=cell["gross_xirr"], display_value=_percent(cell["gross_xirr"]), unit="decimal_rate", quantum="0.0001", **common)
            add(metric_id=f"{prefix}-ownership", label="Series C ownership", value=cell["target_ownership"], display_value=_percent(cell["target_ownership"]), unit="decimal_rate", quantum="0.00000001", **common)
            add(metric_id=f"{prefix}-minimum-cash", label="Minimum cash", value=cell["minimum_cash_cents"], display_value=_money(cell["minimum_cash_cents"]), unit="cents", quantum="1", **common)
        bridge = case["vcValueCreationBridge"]
        bridge_common = {
            "period": "projection origin through month 60",
            "classification": "SCENARIO",
            "locator_ids": locators_for_lineage(
                ["hx-nrr", "hx-margin", "hx-pipeline", "hx-runway"]
            ),
            "receipt_sha256": bridge["receipt_sha256"],
            "assumption_ids": ["vc-value-creation-book"],
            "downstream_ids": ["decision"],
        }
        for lever in bridge["standalone"]:
            for field in (
                "implementation_cost_cents",
                "minimum_cash_delta_cents",
                "target_proceeds_delta_cents",
            ):
                add(metric_id=f"helios-value-{lever['lever_id']}-{field}", label=f"{lever['lever_id']} {field}", value=lever[field], display_value=_money(lever[field]), unit="cents", quantum="1", **bridge_common)
            add(metric_id=f"helios-value-{lever['lever_id']}-gross-xirr-delta", label=f"{lever['lever_id']} gross XIRR impact", value=lever["gross_xirr_delta"], display_value=_percent(lever["gross_xirr_delta"]), unit="decimal_rate", quantum="0.0001", **bridge_common)
            add(metric_id=f"helios-value-{lever['lever_id']}-gross-moic-delta", label=f"{lever['lever_id']} gross MOIC impact", value=lever["gross_moic_delta"], display_value=_multiple(lever["gross_moic_delta"]), unit="multiple", quantum="0.0001", **bridge_common)
        for field in (
            "combined_minimum_cash_delta_cents",
            "combined_target_proceeds_delta_cents",
            "sum_standalone_target_proceeds_delta_cents",
            "interaction_residual_cents",
        ):
            add(metric_id=f"helios-value-{field}", label=field.replace("_", " "), value=bridge[field], display_value=_money(bridge[field]), unit="cents", quantum="1", **bridge_common)
        add(metric_id="helios-value-combined-gross-xirr-delta", label="Combined gross XIRR impact", value=bridge["combined_gross_xirr_delta"], display_value=_percent(bridge["combined_gross_xirr_delta"]), unit="decimal_rate", quantum="0.0001", **bridge_common)
        add(metric_id="helios-value-combined-gross-moic-delta", label="Combined gross MOIC impact", value=bridge["combined_gross_moic_delta"], display_value=_multiple(bridge["combined_gross_moic_delta"]), unit="multiple", quantum="0.0001", **bridge_common)

    metric_ids = [item["metric_id"] for item in metrics]
    if len(metric_ids) != len(set(metric_ids)):
        raise UnderwritingError("metric_registry_duplicate")
    formula_ids = [item["formula_id"] for item in formulas]
    if len(formula_ids) != len(set(formula_ids)):
        raise UnderwritingError("formula_registry_duplicate")
    return {
        "sourceLocators": source_locators,
        "formulaRegistry": formulas,
        "metricRegistry": metrics,
        "renderManifest": {
            "schema_version": "underwriting.render-manifest/v2",
            "metric_ids": render_ids,
            # Browser arithmetic samples are exact binary identities. Dated
            # XIRR formulas remain fully bound and are independently recomputed
            # by the Decimal Python validator rather than approximated in JS.
            "formula_sample_metric_ids": [
                item["output_metric_id"]
                for item in sorted(formulas, key=lambda item: item["operation"] == "DATED_XIRR")[:10]
            ],
        },
    }
