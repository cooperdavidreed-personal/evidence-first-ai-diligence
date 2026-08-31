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


def _quantum_for(value: int | str | Decimal) -> str:
    decimal_value = Decimal(str(value))
    exponent = decimal_value.as_tuple().exponent
    return "1" if exponent >= 0 else f"0.{('0' * (-exponent - 1))}1"


def build_case_metric_contract(
    case: dict[str, Any],
    *,
    source_root: Path | None = None,
    compiled_source_locators: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compile stable source, metric, formula, and render inventories.

    The registry contains exact values. Formatting is retained separately so the
    browser never has to infer an underwriting value from presentation text.
    """

    if compiled_source_locators is None:
        if source_root is None:
            raise UnderwritingError("metric_contract_source_evidence_missing")
        source_locators, locators_by_analysis = compile_source_evidence(
            case, source_root
        )
    else:
        if source_root is not None:
            raise UnderwritingError("metric_contract_source_evidence_ambiguous")
        source_locators = compiled_source_locators
        locators_by_analysis = {
            receipt["analysis_id"]: [
                locator["locator_id"]
                for locator in source_locators
                if locator["analysis_id"] == receipt["analysis_id"]
            ]
            for receipt in case["analyses"]
        }
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

    def add(*, render: bool = True, **kwargs: Any) -> None:
        item = _metric(**kwargs)
        metrics.append(item)
        if render:
            render_ids.append(item["metric_id"])

    def bind_existing_formula(
        metric_id: str,
        formula_id: str,
        operation: str,
        operand_ids: list[str],
        output_unit: str,
        display_value: str | None = None,
    ) -> None:
        metric = next((item for item in metrics if item["metric_id"] == metric_id), None)
        if metric is None or metric["formula_id"] is not None:
            raise UnderwritingError(f"formula_bind_target_invalid:{metric_id}")
        metric["formula_id"] = formula_id
        metric["operand_ids"] = operand_ids
        if display_value is not None:
            metric["display_value"] = display_value
        metric.pop("metric_sha256")
        metric["metric_sha256"] = digest(metric)
        formulas.append(_formula(formula_id, operation, operand_ids, metric_id, output_unit))

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
            # The case-level digest is added only after this contract is built,
            # so summary metrics are governed by the immutable room manifest.
            # Keeping that rule explicit also makes offline contract rebuilding
            # independent of generation order.
            receipt_sha256=case["manifest_sha256"],
            downstream_ids=["decision"],
            **special,
        )

    # Every analysis output receives one deterministic registry identifier. This
    # closes the audit gap between receipt-backed values and the values rendered
    # in the econometric and lineage drawers.
    decision_metric_labels = {
        "helios-hx-01-gross_margin": "Gross margin",
        "helios-hx-02-ordinary_nrr": "Ordinary-cohort NRR",
        "helios-hx-03-post_close_runway_floor": "Post-close runway",
        "helios-hx-09-probability_below_1x": "Modeled loss probability",
    }
    decision_metric_displays = {
        item["metric_id"]: item["observed"]
        for item in case["decision"].get("metric_pairs", [])
    }
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
            metric_id = f"{case['caseId']}-{analysis_id.lower()}-{output_name}"
            add(
                metric_id=metric_id,
                label=decision_metric_labels.get(metric_id, output_name.replace("_", " ").title()),
                value=value,
                display_value=decision_metric_displays.get(
                    metric_id,
                    value
                    if value in {"ABSTAIN", "NONE"}
                    else f"{value} {output['unit']}",
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
        for scenario_key in ("ask", "selected", "downside", "maximum_bid_base", "maximum_bid_downside"):
            result = engine[scenario_key]
            scenario_id = result["scenario_id"]
            receipt = result["receipt_sha256"]
            base = f"{case['caseId']}-{scenario_id}"
            sources = result["sources_and_uses"]
            transaction = result["engine_inputs"]["transaction"]
            debt = result["debt_schedule"]
            period = f"{result['engine_inputs']['close_date']} through month 60"
            sponsor_cash_flow_ids = [
                f"{base}-sponsor-cash-flow-{index:02d}"
                for index, _ in enumerate(result["sponsor_cash_flows"], start=1)
            ]
            scenario_formula_stem = f"pe-formula-{scenario_key}"
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
            debt_formula_id = f"{scenario_formula_stem}-exit-debt"
            liquidity_formula_id = f"{scenario_formula_stem}-min-liquidity"
            headroom_formula_id = f"{scenario_formula_stem}-min-headroom"
            exit_ev_formula_id = f"{scenario_formula_stem}-exit-enterprise-value"
            exit_cash_formula_id = f"{scenario_formula_stem}-exit-cash"
            exit_net_formula_id = f"{scenario_formula_stem}-exit-net"
            exit_equity_formula_id = f"{scenario_formula_stem}-exit-equity"
            month_cash_ids = [f"{base}-month-{month:02d}-ending_cash_cents" for month in range(1, 61)]
            month_headroom_ids = [f"{base}-month-{month:02d}-covenant_headroom" for month in range(1, 61)]
            add_cents(f"{base}-exit-debt", "Exit debt", debt["ending_debt_cents"], formula_id=debt_formula_id, operand_ids=[f"{base}-month-60-ending_term_cents", f"{base}-month-60-ending_revolver_cents"])
            add_cents(f"{base}-min-liquidity", "Minimum liquidity", debt["minimum_liquidity_cents"], formula_id=liquidity_formula_id, operand_ids=month_cash_ids)
            min_headroom = min(Decimal(item["covenant_headroom"]) for item in debt["months"])
            add(metric_id=f"{base}-min-headroom", label="Minimum headroom", value=min_headroom, display_value=_multiple(str(min_headroom)), unit="turns", quantum=_quantum_for(min_headroom), formula_id=headroom_formula_id, operand_ids=month_headroom_ids, **common)
            exit_ebitda = int(result["exit_ltm_ebitda_cents"])
            add(render=False, metric_id=f"{base}-exit-ebitda", label="LTM exit EBITDA", value=exit_ebitda, display_value=_money(exit_ebitda), unit="cents", quantum="1", **common)
            add(render=False, metric_id=f"{base}-exit-multiple", label="Exit multiple", value=transaction["exit_multiple"], display_value=_multiple(transaction["exit_multiple"]), unit="multiple", quantum=_quantum_for(transaction["exit_multiple"]), **common)
            add_cents(f"{base}-exit-ev", "Exit enterprise value", result["exit_enterprise_value_cents"], formula_id=exit_ev_formula_id, operand_ids=[f"{base}-exit-ebitda", f"{base}-exit-multiple"])
            final_cash = debt["months"][-1]["ending_cash_cents"]
            add_cents(f"{base}-exit-cash", "Exit cash", final_cash, formula_id=exit_cash_formula_id, operand_ids=[f"{base}-month-60-ending_cash_cents", f"{base}-sources-reconcile"])
            add_cents(f"{base}-exit-net", "Exit enterprise value less debt", result["exit_enterprise_value_cents"] - debt["ending_debt_cents"], formula_id=exit_net_formula_id, operand_ids=[f"{base}-exit-ev", f"{base}-exit-debt"])
            add_cents(f"{base}-exit-equity", "Exit equity", result["exit_equity_value_cents"], formula_id=exit_equity_formula_id, operand_ids=[f"{base}-exit-net", f"{base}-exit-cash"])
            add(
                metric_id=f"{base}-gross-irr", label="Gross IRR", value=result["gross_xirr"],
                display_value=_percent(result["gross_xirr"]), unit="decimal_rate", quantum=_quantum_for(result["gross_xirr"]),
                formula_id=f"{scenario_formula_stem}-gross-irr",
                operand_ids=sponsor_cash_flow_ids,
                **common,
            )
            add(
                metric_id=f"{base}-gross-moic", label="Gross MOIC", value=result["gross_moic"],
                display_value=_multiple(result["gross_moic"]), unit="multiple", quantum=_quantum_for(result["gross_moic"]),
                formula_id=f"{scenario_formula_stem}-gross-moic",
                operand_ids=[f"{base}-sponsor-proceeds", f"{base}-sponsor-invested"],
                **common,
            )
            add_cents(f"{base}-earnout", "Earnout paid", result["earnout_cents"])

            for index, flow in enumerate(result["sponsor_cash_flows"], start=1):
                metric_id = f"{base}-sponsor-cash-flow-{index:02d}"
                add(
                    render=False,
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
            sponsor_invested = -sum(
                int(flow["amount_cents"])
                for flow in result["sponsor_cash_flows"]
                if int(flow["amount_cents"]) < 0
            )
            sponsor_proceeds = sum(
                int(flow["amount_cents"])
                for flow in result["sponsor_cash_flows"]
                if int(flow["amount_cents"]) > 0
            )
            add_cents(
                f"{base}-sponsor-invested", "Sponsor invested capital", sponsor_invested,
                formula_id=f"{scenario_formula_stem}-sponsor-invested", operand_ids=sponsor_cash_flow_ids,
            )
            add_cents(
                f"{base}-sponsor-proceeds", "Sponsor proceeds", sponsor_proceeds,
                formula_id=f"{scenario_formula_stem}-sponsor-proceeds", operand_ids=sponsor_cash_flow_ids,
            )
            formulas.extend(
                [
                    _formula(f"{scenario_formula_stem}-sponsor-invested", "ABS_SUM_NEGATIVE", sponsor_cash_flow_ids, f"{base}-sponsor-invested", "cents"),
                    _formula(f"{scenario_formula_stem}-sponsor-proceeds", "SUM_POSITIVE", sponsor_cash_flow_ids, f"{base}-sponsor-proceeds", "cents"),
                    _formula(f"{scenario_formula_stem}-gross-moic", "DIVIDE", [f"{base}-sponsor-proceeds", f"{base}-sponsor-invested"], f"{base}-gross-moic", "multiple"),
                    _formula(f"{scenario_formula_stem}-gross-irr", "DATED_XIRR", sponsor_cash_flow_ids, f"{base}-gross-irr", "decimal_rate"),
                    _formula(debt_formula_id, "ADD", [f"{base}-month-60-ending_term_cents", f"{base}-month-60-ending_revolver_cents"], f"{base}-exit-debt", "cents"),
                    _formula(liquidity_formula_id, "MIN", month_cash_ids, f"{base}-min-liquidity", "cents"),
                    _formula(headroom_formula_id, "MIN", month_headroom_ids, f"{base}-min-headroom", "turns"),
                    _formula(exit_ev_formula_id, "MULTIPLY", [f"{base}-exit-ebitda", f"{base}-exit-multiple"], f"{base}-exit-ev", "cents"),
                    _formula(exit_cash_formula_id, "ADD", [f"{base}-month-60-ending_cash_cents", f"{base}-sources-reconcile"], f"{base}-exit-cash", "cents"),
                    _formula(exit_net_formula_id, "SUBTRACT", [f"{base}-exit-ev", f"{base}-exit-debt"], f"{base}-exit-net", "cents"),
                    _formula(exit_equity_formula_id, "ADD", [f"{base}-exit-net", f"{base}-exit-cash"], f"{base}-exit-equity", "cents"),
                ]
            )
            if scenario_key == "selected":
                formulas.append(
                    _formula("pe-formula-headline-dated-xirr", "DATED_XIRR", sponsor_cash_flow_ids, "ag-return", "decimal_rate")
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
        draw_count_id = f"{case['caseId']}-distribution-draw-count"
        add(render=False, metric_id=draw_count_id, label="Retained scenario paths", value=distribution["draws"], display_value=f"{distribution['draws']:,} paths", unit="count", quantum="1", **distribution_common)
        pe_path_moic_ids: list[str] = []
        for path_index, path in enumerate(distribution["path_records"]):
            path_id = f"{case['caseId']}-distribution-path-{path_index:04d}-moic"
            add(render=False, metric_id=path_id, label=f"Retained path {path_index + 1} gross MOIC", value=path["gross_moic"], display_value=_multiple(path["gross_moic"]), unit="multiple", quantum=_quantum_for(path["gross_moic"]), **distribution_common)
            pe_path_moic_ids.append(path_id)
        for index, value in enumerate(distribution["moic_quantiles"]):
            percentile = ["p10", "p50", "p90"][index]
            formula_id = f"pe-formula-distribution-{percentile}-moic"
            output_id = f"{case['caseId']}-distribution-{index}"
            probability = (Decimal("0.10"), Decimal("0.50"), Decimal("0.90"))[index]
            rank = int((Decimal(distribution["draws"] - 1) * probability).quantize(Decimal("1")))
            rank_id = f"{case['caseId']}-distribution-{percentile}-rank-index"
            add(render=False, metric_id=rank_id, label=f"{percentile} zero-based rank", value=rank, display_value=f"Rank {rank + 1} of {distribution['draws']}", unit="rank_index", quantum="1", **distribution_common)
            operands = [draw_count_id, rank_id, *pe_path_moic_ids]
            add(metric_id=output_id, label=f"{percentile} conditional MOIC", value=value, display_value=_multiple(value), unit="multiple", quantum=_quantum_for(value), formula_id=formula_id, operand_ids=operands, **distribution_common)
            formulas.append(_formula(formula_id, f"QUANTILE_{percentile.upper()}", operands, output_id, "multiple"))
        bind_existing_formula(
            f"{case['caseId']}-ag-11-probability_below_1x",
            "pe-formula-distribution-probability-below-one",
            "PROBABILITY_BELOW_ONE_PERCENT",
            pe_path_moic_ids,
            "percent",
            f"{(Decimal(distribution['probability_below_one']) * 100).quantize(Decimal('0.01'))}%",
        )

        for cell in engine["sensitivities"]["one_way"] + engine["sensitivities"]["entry_exit_matrix"]:
            common = {
                "period": "close through month 60", "classification": "SCENARIO",
                "locator_ids": list(locators_by_analysis["AG-10"]),
                "receipt_sha256": cell["receipt_sha256"],
                "assumption_ids": [cell["cell_id"]], "downstream_ids": ["decision"],
            }
            prefix = f"{case['caseId']}-{cell['cell_id']}"
            cash_flow_ids: list[str] = []
            for flow_index, flow in enumerate(cell["sponsor_cash_flows"], start=1):
                flow_id = f"{prefix}-cash-flow-{flow_index:02d}"
                add(render=False, metric_id=flow_id, label=f"Sponsor dated cash flow {flow_index}", value=flow["amount_cents"], display_value=_money(flow["amount_cents"]), unit="cents", quantum="1", period=flow["date"], classification="SCENARIO", locator_ids=common["locator_ids"], receipt_sha256=common["receipt_sha256"], assumption_ids=common["assumption_ids"], downstream_ids=["decision"])
                cash_flow_ids.append(flow_id)
            invested_id = f"{prefix}-sponsor-invested"
            proceeds_id = f"{prefix}-sponsor-proceeds"
            invested = -sum(int(flow["amount_cents"]) for flow in cell["sponsor_cash_flows"] if int(flow["amount_cents"]) < 0)
            proceeds = sum(int(flow["amount_cents"]) for flow in cell["sponsor_cash_flows"] if int(flow["amount_cents"]) > 0)
            invested_formula = f"pe-formula-{cell['cell_id']}-invested"
            proceeds_formula = f"pe-formula-{cell['cell_id']}-proceeds"
            irr_formula = f"pe-formula-{cell['cell_id']}-irr"
            moic_formula = f"pe-formula-{cell['cell_id']}-moic"
            add(render=False, metric_id=invested_id, label="Sponsor invested capital", value=invested, display_value=_money(invested), unit="cents", quantum="1", formula_id=invested_formula, operand_ids=cash_flow_ids, **common)
            add(render=False, metric_id=proceeds_id, label="Sponsor proceeds", value=proceeds, display_value=_money(proceeds), unit="cents", quantum="1", formula_id=proceeds_formula, operand_ids=cash_flow_ids, **common)
            add(metric_id=f"{prefix}-irr", label="Gross IRR", value=cell["gross_xirr"], display_value=_percent(cell["gross_xirr"]), unit="decimal_rate", quantum=_quantum_for(cell["gross_xirr"]), formula_id=irr_formula, operand_ids=cash_flow_ids, **common)
            add(metric_id=f"{prefix}-moic", label="Gross MOIC", value=cell["gross_moic"], display_value=_multiple(cell["gross_moic"]), unit="multiple", quantum=_quantum_for(cell["gross_moic"]), formula_id=moic_formula, operand_ids=[proceeds_id, invested_id], **common)
            term_id = f"{prefix}-ending-term"
            revolver_id = f"{prefix}-ending-revolver"
            add(render=False, metric_id=term_id, label="Ending term debt", value=cell["ending_term_cents"], display_value=_money(cell["ending_term_cents"]), unit="cents", quantum="1", **common)
            add(render=False, metric_id=revolver_id, label="Ending revolver", value=cell["ending_revolver_cents"], display_value=_money(cell["ending_revolver_cents"]), unit="cents", quantum="1", **common)
            debt_formula = f"pe-formula-{cell['cell_id']}-debt"
            add(metric_id=f"{prefix}-debt", label="Exit debt", value=cell["ending_debt_cents"], display_value=_money(cell["ending_debt_cents"]), unit="cents", quantum="1", formula_id=debt_formula, operand_ids=[term_id, revolver_id], **common)
            headroom_ids: list[str] = []
            for month, headroom in enumerate(cell["covenant_headrooms"], start=1):
                headroom_id = f"{prefix}-headroom-{month:02d}"
                add(render=False, metric_id=headroom_id, label=f"Month {month} covenant headroom", value=headroom, display_value=_multiple(headroom), unit="turns", quantum=_quantum_for(headroom), **common)
                headroom_ids.append(headroom_id)
            headroom_formula = f"pe-formula-{cell['cell_id']}-headroom"
            add(metric_id=f"{prefix}-headroom", label="Minimum headroom", value=cell["minimum_covenant_headroom"], display_value=_multiple(cell["minimum_covenant_headroom"]), unit="turns", quantum=_quantum_for(cell["minimum_covenant_headroom"]), formula_id=headroom_formula, operand_ids=headroom_ids, **common)
            formulas.extend([
                _formula(invested_formula, "ABS_SUM_NEGATIVE", cash_flow_ids, invested_id, "cents"),
                _formula(proceeds_formula, "SUM_POSITIVE", cash_flow_ids, proceeds_id, "cents"),
                _formula(irr_formula, "DATED_XIRR", cash_flow_ids, f"{prefix}-irr", "decimal_rate"),
                _formula(moic_formula, "DIVIDE", [proceeds_id, invested_id], f"{prefix}-moic", "multiple"),
                _formula(debt_formula, "ADD", [term_id, revolver_id], f"{prefix}-debt", "cents"),
                _formula(headroom_formula, "MIN", headroom_ids, f"{prefix}-headroom", "turns"),
            ])

        bridge = case["valueCreationBridge"]
        bridge_common = {
            "period": "close through month 60", "classification": "SCENARIO",
            "locator_ids": locators_for_lineage(
                ["ag-nrr", "ag-support", "ag-margin"]
            ),
            "receipt_sha256": bridge["receipt_sha256"], "assumption_ids": ["value-creation-book"],
            "downstream_ids": ["decision"],
        }
        pe_base_values: dict[str, int | str | Decimal] = {
            "exit_ebitda_delta_cents": bridge["base_exit_ebitda_cents"],
            "exit_debt_delta_cents": bridge["base_exit_debt_cents"],
            "exit_equity_delta_cents": bridge["base_exit_equity_cents"],
            "gross_xirr_delta": bridge["base_gross_xirr"],
            "gross_moic_delta": bridge["base_gross_moic"],
        }
        for field, value in pe_base_values.items():
            unit = "decimal_rate" if field == "gross_xirr_delta" else "multiple" if field == "gross_moic_delta" else "cents"
            add(render=False, metric_id=f"atlasgrid-value-base-{field}", label=f"Base {field}", value=value, display_value=_percent(str(value)) if unit == "decimal_rate" else _multiple(str(value)) if unit == "multiple" else _money(int(value)), unit=unit, quantum=_quantum_for(value), **bridge_common)
        for lever in bridge["standalone"]:
            result_fields = {
                "exit_ebitda_delta_cents": lever["result_exit_ebitda_cents"],
                "exit_debt_delta_cents": lever["result_exit_debt_cents"],
                "exit_equity_delta_cents": lever["result_exit_equity_cents"],
                "gross_xirr_delta": lever["result_gross_xirr"],
                "gross_moic_delta": lever["result_gross_moic"],
            }
            for field in ("exit_ebitda_delta_cents", "exit_debt_delta_cents", "exit_equity_delta_cents", "gross_xirr_delta", "gross_moic_delta"):
                unit = "decimal_rate" if field == "gross_xirr_delta" else "multiple" if field == "gross_moic_delta" else "cents"
                result_value = result_fields[field]
                result_id = f"atlasgrid-value-{lever['lever_id']}-{field}-result"
                output_id = f"atlasgrid-value-{lever['lever_id']}-{field}"
                formula_id = f"pe-formula-value-{lever['lever_id']}-{field}"
                add(render=False, metric_id=result_id, label=f"{lever['label']} result {field}", value=result_value, display_value=_percent(str(result_value)) if unit == "decimal_rate" else _multiple(str(result_value)) if unit == "multiple" else _money(int(result_value)), unit=unit, quantum=_quantum_for(result_value), **bridge_common)
                add(metric_id=output_id, label=f"{lever['label']} {field}", value=lever[field], display_value=_percent(lever[field]) if unit == "decimal_rate" else _multiple(lever[field]) if unit == "multiple" else _money(lever[field]), unit=unit, quantum=_quantum_for(lever[field]), formula_id=formula_id, operand_ids=[result_id, f"atlasgrid-value-base-{field}"], **bridge_common)
                formulas.append(_formula(formula_id, "SUBTRACT", [result_id, f"atlasgrid-value-base-{field}"], output_id, unit))
            add(metric_id=f"atlasgrid-value-{lever['lever_id']}-implementation_cost_cents", label=f"{lever['label']} implementation cost", value=lever["implementation_cost_cents"], display_value=_money(lever["implementation_cost_cents"]), unit="cents", quantum="1", **bridge_common)
        standalone_equity_ids = [f"atlasgrid-value-{lever['lever_id']}-exit_equity_delta_cents" for lever in bridge["standalone"]]
        sum_id = "atlasgrid-value-standalone-sum"
        sum_formula = "pe-formula-value-standalone-sum"
        combined_formula = "pe-formula-value-combined"
        interaction_formula = "pe-formula-value-interaction"
        combined_result_id = "atlasgrid-value-combined-exit-equity-result"
        combined_result_value = int(bridge["combined_exit_equity_cents"])
        add(render=False, metric_id=combined_result_id, label="Combined exit equity result", value=combined_result_value, display_value=_money(combined_result_value), unit="cents", quantum="1", **bridge_common)
        add(render=False, metric_id=sum_id, label="Standalone exit-equity impact", value=bridge["sum_standalone_exit_equity_delta_cents"], display_value=_money(bridge["sum_standalone_exit_equity_delta_cents"]), unit="cents", quantum="1", formula_id=sum_formula, operand_ids=standalone_equity_ids, **bridge_common)
        add(metric_id="atlasgrid-value-combined", label="Combined value-creation impact", value=bridge["combined_exit_equity_delta_cents"], display_value=_money(bridge["combined_exit_equity_delta_cents"]), unit="cents", quantum="1", formula_id=combined_formula, operand_ids=[combined_result_id, "atlasgrid-value-base-exit_equity_delta_cents"], **bridge_common)
        add(metric_id="atlasgrid-value-interaction", label="Value-creation interaction residual", value=bridge["interaction_residual_cents"], display_value=_money(bridge["interaction_residual_cents"]), unit="cents", quantum="1", formula_id=interaction_formula, operand_ids=["atlasgrid-value-combined", sum_id], **bridge_common)
        formulas.extend([
            _formula(sum_formula, "SUM", standalone_equity_ids, sum_id, "cents"),
            _formula(combined_formula, "SUBTRACT", [combined_result_id, "atlasgrid-value-base-exit_equity_delta_cents"], "atlasgrid-value-combined", "cents"),
            _formula(interaction_formula, "SUBTRACT", ["atlasgrid-value-combined", sum_id], "atlasgrid-value-interaction", "cents"),
        ])

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
            exit_cash_formula = f"vc-formula-{scenario_id.lower()}-bridge-exit-cash"
            exit_cash_zero_id = f"{prefix}-bridge-exit-cash-zero"
            add(render=False, metric_id=exit_cash_zero_id, label="Exit cash identity zero", value=0, display_value="$0", unit="cents", quantum="1", **common)
            add_vc_cents(f"{prefix}-bridge-exit-cash", "Modeled exit cash", int(exit_bridge["cash_at_exit_cents"]), formula_id=exit_cash_formula, operand_ids=[f"{prefix}-month-60-ending_cash_cents", exit_cash_zero_id])
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
                    _formula(
                        exit_cash_formula,
                        "ADD",
                        [f"{prefix}-month-60-ending_cash_cents", exit_cash_zero_id],
                        f"{prefix}-bridge-exit-cash",
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
            monthly_ending_cash_ids = [
                f"{prefix}-month-{row['month']:02d}-ending_cash_cents"
                for row in result["cash_by_month"]
            ]
            minimum_cash_formula = f"vc-formula-{scenario_id.lower()}-minimum-cash"
            add_vc_cents(
                f"{prefix}-minimum-cash",
                "Minimum modeled cash",
                result["minimum_cash_cents"],
                formula_id=minimum_cash_formula,
                operand_ids=monthly_ending_cash_ids,
            )
            formulas.append(
                _formula(
                    minimum_cash_formula,
                    "MIN",
                    monthly_ending_cash_ids,
                    f"{prefix}-minimum-cash",
                    "cents",
                )
            )
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
            target_proceeds_zero_id = f"{prefix}-target-proceeds-zero"
            target_proceeds_formula = f"vc-formula-{scenario_id.lower()}-target-proceeds"
            add_vc_cents(target_proceeds_zero_id, "Target proceeds reconciliation constant", 0, render=False)
            target_proceeds_metric = next(
                item for item in metrics if item["metric_id"] == f"{prefix}-target-proceeds"
            )
            target_proceeds_metric["formula_id"] = target_proceeds_formula
            target_proceeds_metric["operand_ids"] = [
                f"{prefix}-waterfall-series_c-proceeds",
                target_proceeds_zero_id,
            ]
            target_proceeds_metric["metric_sha256"] = digest(
                {key: value for key, value in target_proceeds_metric.items() if key != "metric_sha256"}
            )
            formulas.append(
                _formula(
                    target_proceeds_formula,
                    "ADD",
                    [f"{prefix}-waterfall-series_c-proceeds", target_proceeds_zero_id],
                    f"{prefix}-target-proceeds",
                    "cents",
                )
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
        vc_draw_count_id = "helios-distribution-draw-count"
        add(render=False, metric_id=vc_draw_count_id, label="Retained scenario paths", value=distribution["draws"], display_value=f"{distribution['draws']:,} paths", unit="count", quantum="1", **distribution_common)
        vc_path_moic_ids: list[str] = []
        vc_path_xirr_ids: list[str] = []
        for path_index, path in enumerate(distribution["path_records"]):
            moic_id = f"helios-distribution-path-{path_index:04d}-moic"
            xirr_id = f"helios-distribution-path-{path_index:04d}-xirr"
            add(render=False, metric_id=moic_id, label=f"Retained path {path_index + 1} gross MOIC", value=path["gross_moic"], display_value=_multiple(path["gross_moic"]), unit="multiple", quantum=_quantum_for(path["gross_moic"]), **distribution_common)
            add(render=False, metric_id=xirr_id, label=f"Retained path {path_index + 1} gross XIRR", value=path["gross_xirr"], display_value=_percent(path["gross_xirr"]), unit="decimal_rate", quantum=_quantum_for(path["gross_xirr"]), **distribution_common)
            vc_path_moic_ids.append(moic_id)
            vc_path_xirr_ids.append(xirr_id)
        rank_ids: dict[str, str] = {}
        for index, percentile in enumerate(("p10", "p50", "p90")):
            probability = (Decimal("0.10"), Decimal("0.50"), Decimal("0.90"))[index]
            rank = int((Decimal(distribution["draws"] - 1) * probability).quantize(Decimal("1")))
            rank_id = f"helios-distribution-{percentile}-rank-index"
            add(render=False, metric_id=rank_id, label=f"{percentile} zero-based rank", value=rank, display_value=f"Rank {rank + 1} of {distribution['draws']}", unit="rank_index", quantum="1", **distribution_common)
            rank_ids[percentile] = rank_id
        for index, value in enumerate(distribution["moic_quantiles"]):
            percentile = ["p10", "p50", "p90"][index]
            formula_id = f"vc-formula-distribution-{percentile}-moic"
            output_id = f"helios-distribution-moic-{index}"
            operands = [vc_draw_count_id, rank_ids[percentile], *vc_path_moic_ids]
            add(
                metric_id=output_id,
                label=f"{percentile} conditional MOIC",
                value=value,
                display_value=_multiple(value),
                unit="multiple",
                quantum=_quantum_for(value),
                formula_id=formula_id,
                operand_ids=operands,
                **distribution_common,
            )
            formulas.append(_formula(formula_id, f"QUANTILE_{percentile.upper()}", operands, output_id, "multiple"))
        for index, value in enumerate(distribution["xirr_quantiles"]):
            percentile = ["p10", "p50", "p90"][index]
            formula_id = f"vc-formula-distribution-{percentile}-xirr"
            output_id = f"helios-distribution-xirr-{index}"
            operands = [vc_draw_count_id, rank_ids[percentile], *vc_path_xirr_ids]
            add(
                metric_id=output_id,
                label=f"{percentile} conditional XIRR",
                value=value,
                display_value=_percent(value),
                unit="decimal_rate",
                quantum=_quantum_for(value),
                formula_id=formula_id,
                operand_ids=operands,
                **distribution_common,
            )
            formulas.append(_formula(formula_id, f"QUANTILE_{percentile.upper()}", operands, output_id, "decimal_rate"))
        bind_existing_formula(
            "helios-hx-09-probability_below_1x",
            "vc-formula-distribution-probability-below-one",
            "PROBABILITY_BELOW_ONE_PERCENT",
            vc_path_moic_ids,
            "percent",
            f"{(Decimal(distribution['probability_below_one']) * 100).quantize(Decimal('0.01'))}%",
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
            cash_flow_ids: list[str] = []
            for flow_index, flow in enumerate(cell["target_cash_flows"], start=1):
                flow_id = f"{prefix}-cash-flow-{flow_index:02d}"
                add(render=False, metric_id=flow_id, label=f"Series C dated cash flow {flow_index}", value=flow["amount_cents"], display_value=_money(flow["amount_cents"]), unit="cents", quantum="1", period=flow["date"], classification="SCENARIO", locator_ids=common["locator_ids"], receipt_sha256=common["receipt_sha256"], assumption_ids=common["assumption_ids"], downstream_ids=["decision"])
                cash_flow_ids.append(flow_id)
            invested_id = f"{prefix}-invested"
            proceeds_id = f"{prefix}-proceeds"
            invested = -sum(int(flow["amount_cents"]) for flow in cell["target_cash_flows"] if int(flow["amount_cents"]) < 0)
            proceeds = sum(int(flow["amount_cents"]) for flow in cell["target_cash_flows"] if int(flow["amount_cents"]) > 0)
            target_shares_id = f"{prefix}-target-shares"
            fully_diluted_id = f"{prefix}-fully-diluted-shares"
            ending_cash_ids: list[str] = []
            for month, ending_cash in enumerate(cell["ending_cash_path_cents"], start=1):
                cash_id = f"{prefix}-ending-cash-{month:02d}"
                add(render=False, metric_id=cash_id, label=f"Month {month} ending cash", value=ending_cash, display_value=_money(ending_cash), unit="cents", quantum="1", **common)
                ending_cash_ids.append(cash_id)
            for metric_id, label, value, unit in (
                (invested_id, "Series C invested capital", invested, "cents"),
                (proceeds_id, "Series C proceeds", proceeds, "cents"),
                (target_shares_id, "Series C shares", cell["target_shares"], "shares"),
                (fully_diluted_id, "Fully diluted shares", cell["fully_diluted_shares"], "shares"),
            ):
                add(render=False, metric_id=metric_id, label=label, value=value, display_value=_money(value) if unit == "cents" else f"{value:,}", unit=unit, quantum="1", **common)
            formula_stem = f"vc-formula-{cell['cell_id']}"
            add(metric_id=f"{prefix}-gross-moic", label="Gross MOIC", value=cell["gross_moic"], display_value=_multiple(cell["gross_moic"]), unit="multiple", quantum=_quantum_for(cell["gross_moic"]), formula_id=f"{formula_stem}-moic", operand_ids=[proceeds_id, invested_id], **common)
            add(metric_id=f"{prefix}-gross-xirr", label="Gross XIRR", value=cell["gross_xirr"], display_value=_percent(cell["gross_xirr"]), unit="decimal_rate", quantum=_quantum_for(cell["gross_xirr"]), formula_id=f"{formula_stem}-xirr", operand_ids=cash_flow_ids, **common)
            add(metric_id=f"{prefix}-ownership", label="Series C ownership", value=cell["target_ownership"], display_value=_percent(cell["target_ownership"]), unit="decimal_rate", quantum=_quantum_for(cell["target_ownership"]), formula_id=f"{formula_stem}-ownership", operand_ids=[target_shares_id, fully_diluted_id], **common)
            add(metric_id=f"{prefix}-minimum-cash", label="Minimum cash", value=cell["minimum_cash_cents"], display_value=_money(cell["minimum_cash_cents"]), unit="cents", quantum="1", formula_id=f"{formula_stem}-minimum-cash", operand_ids=ending_cash_ids, **common)
            formulas.extend([
                _formula(f"{formula_stem}-moic", "DIVIDE", [proceeds_id, invested_id], f"{prefix}-gross-moic", "multiple"),
                _formula(f"{formula_stem}-xirr", "DATED_XIRR", cash_flow_ids, f"{prefix}-gross-xirr", "decimal_rate"),
                _formula(f"{formula_stem}-ownership", "DIVIDE", [target_shares_id, fully_diluted_id], f"{prefix}-ownership", "decimal_rate"),
                _formula(f"{formula_stem}-minimum-cash", "MIN", ending_cash_ids, f"{prefix}-minimum-cash", "cents"),
            ])
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
        vc_value_fields = {
            "minimum_cash_delta_cents": (bridge["base_minimum_cash_cents"], "cents"),
            "target_proceeds_delta_cents": (bridge["base_target_proceeds_cents"], "cents"),
            "gross-xirr-delta": (bridge["base_gross_xirr"], "decimal_rate"),
            "gross-moic-delta": (bridge["base_gross_moic"], "multiple"),
        }
        for field, (value, unit) in vc_value_fields.items():
            add(render=False, metric_id=f"helios-value-base-{field}", label=f"Base {field}", value=value, display_value=_money(value) if unit == "cents" else _percent(value) if unit == "decimal_rate" else _multiple(value), unit=unit, quantum=_quantum_for(value), **bridge_common)
        for lever in bridge["standalone"]:
            lever_values = {
                "minimum_cash_delta_cents": lever["minimum_cash_delta_cents"],
                "target_proceeds_delta_cents": lever["target_proceeds_delta_cents"],
                "gross-xirr-delta": lever["gross_xirr_delta"],
                "gross-moic-delta": lever["gross_moic_delta"],
            }
            result_values = {
                "minimum_cash_delta_cents": lever["result_minimum_cash_cents"],
                "target_proceeds_delta_cents": lever["result_target_proceeds_cents"],
                "gross-xirr-delta": lever["result_gross_xirr"],
                "gross-moic-delta": lever["result_gross_moic"],
            }
            for field, delta_value in lever_values.items():
                base_value, unit = vc_value_fields[field]
                result_value = result_values[field]
                result_id = f"helios-value-{lever['lever_id']}-{field}-result"
                output_id = f"helios-value-{lever['lever_id']}-{field}"
                formula_id = f"vc-formula-value-{lever['lever_id']}-{field}"
                add(render=False, metric_id=result_id, label=f"{lever['lever_id']} result {field}", value=result_value, display_value=_money(int(result_value)) if unit == "cents" else _percent(str(result_value)) if unit == "decimal_rate" else _multiple(str(result_value)), unit=unit, quantum=_quantum_for(result_value), **bridge_common)
                add(metric_id=output_id, label=f"{lever['lever_id']} {field.replace('_', ' ')}", value=delta_value, display_value=_money(delta_value) if unit == "cents" else _percent(delta_value) if unit == "decimal_rate" else _multiple(delta_value), unit=unit, quantum=_quantum_for(delta_value), formula_id=formula_id, operand_ids=[result_id, f"helios-value-base-{field}"], **bridge_common)
                formulas.append(_formula(formula_id, "SUBTRACT", [result_id, f"helios-value-base-{field}"], output_id, unit))
            add(metric_id=f"helios-value-{lever['lever_id']}-implementation_cost_cents", label=f"{lever['lever_id']} implementation cost", value=lever["implementation_cost_cents"], display_value=_money(lever["implementation_cost_cents"]), unit="cents", quantum="1", **bridge_common)

        combined_values = {
            "minimum_cash_delta_cents": bridge["combined_minimum_cash_delta_cents"],
            "target_proceeds_delta_cents": bridge["combined_target_proceeds_delta_cents"],
            "gross-xirr-delta": bridge["combined_gross_xirr_delta"],
            "gross-moic-delta": bridge["combined_gross_moic_delta"],
        }
        combined_result_values = {
            "minimum_cash_delta_cents": bridge["combined_result_minimum_cash_cents"],
            "target_proceeds_delta_cents": bridge["combined_result_target_proceeds_cents"],
            "gross-xirr-delta": bridge["combined_result_gross_xirr"],
            "gross-moic-delta": bridge["combined_result_gross_moic"],
        }
        for field, delta_value in combined_values.items():
            base_value, unit = vc_value_fields[field]
            result_value = combined_result_values[field]
            result_id = f"helios-value-combined-{field}-result"
            output_id = f"helios-value-combined_{field}" if field.endswith("_cents") else f"helios-value-combined-{field}"
            formula_id = f"vc-formula-value-combined-{field}"
            add(render=False, metric_id=result_id, label=f"Combined result {field}", value=result_value, display_value=_money(int(result_value)) if unit == "cents" else _percent(str(result_value)) if unit == "decimal_rate" else _multiple(str(result_value)), unit=unit, quantum=_quantum_for(result_value), **bridge_common)
            add(metric_id=output_id, label=f"Combined {field.replace('_', ' ')}", value=delta_value, display_value=_money(delta_value) if unit == "cents" else _percent(delta_value) if unit == "decimal_rate" else _multiple(delta_value), unit=unit, quantum=_quantum_for(delta_value), formula_id=formula_id, operand_ids=[result_id, f"helios-value-base-{field}"], **bridge_common)
            formulas.append(_formula(formula_id, "SUBTRACT", [result_id, f"helios-value-base-{field}"], output_id, unit))

        standalone_proceeds_ids = [f"helios-value-{lever['lever_id']}-target_proceeds_delta_cents" for lever in bridge["standalone"]]
        sum_id = "helios-value-sum_standalone_target_proceeds_delta_cents"
        sum_formula = "vc-formula-value-standalone-proceeds-sum"
        interaction_formula = "vc-formula-value-interaction"
        add(render=False, metric_id=sum_id, label="Standalone target proceeds sum", value=bridge["sum_standalone_target_proceeds_delta_cents"], display_value=_money(bridge["sum_standalone_target_proceeds_delta_cents"]), unit="cents", quantum="1", formula_id=sum_formula, operand_ids=standalone_proceeds_ids, **bridge_common)
        add(metric_id="helios-value-interaction_residual_cents", label="Interaction residual", value=bridge["interaction_residual_cents"], display_value=_money(bridge["interaction_residual_cents"]), unit="cents", quantum="1", formula_id=interaction_formula, operand_ids=["helios-value-combined_target_proceeds_delta_cents", sum_id], **bridge_common)
        formulas.extend([
            _formula(sum_formula, "SUM", standalone_proceeds_ids, sum_id, "cents"),
            _formula(interaction_formula, "SUBTRACT", ["helios-value-combined_target_proceeds_delta_cents", sum_id], "helios-value-interaction_residual_cents", "cents"),
        ])

    metric_ids = [item["metric_id"] for item in metrics]
    if len(metric_ids) != len(set(metric_ids)):
        raise UnderwritingError("metric_registry_duplicate")
    formula_ids = [item["formula_id"] for item in formulas]
    if len(formula_ids) != len(set(formula_ids)):
        raise UnderwritingError("formula_registry_duplicate")
    rendered_metrics = [item for item in metrics if item["metric_id"] in render_ids]
    derived_id_patterns = (
        re.compile(r"(?:gross-(?:irr|xirr|moic)|-(?:irr|moic|debt|headroom|minimum-cash|ownership))$"),
        re.compile(r"-exit-(?:ev|equity|debt|cash|net)$"),
        re.compile(r"-distribution-(?:moic-|xirr-|[0-9]+$)"),
        re.compile(r"-value-.*(?:delta|combined|interaction)"),
    )
    semantic_investment_ids = [
        item["metric_id"]
        for item in rendered_metrics
        if item["metric_id"] in {"ag-return", "hx-ownership", "atlasgrid-ag-11-probability_below_1x", "helios-hx-09-probability_below_1x"}
        or any(pattern.search(item["metric_id"]) for pattern in derived_id_patterns)
    ]
    missing_calculations = [
        item["metric_id"]
        for item in rendered_metrics
        if item["metric_id"] in semantic_investment_ids
        and (item["formula_id"] is None or not item["operand_ids"])
    ]
    if missing_calculations:
        raise UnderwritingError(
            f"semantic_investment_metric_calculation_open:{','.join(missing_calculations)}"
        )
    return {
        "sourceLocators": source_locators,
        "formulaRegistry": formulas,
        "metricRegistry": metrics,
        "renderManifest": {
            "schema_version": "underwriting.render-manifest/v2",
            "metric_ids": render_ids,
            "investment_metric_ids": semantic_investment_ids,
            # Browser arithmetic samples are exact binary identities. Dated
            # XIRR formulas remain fully bound and are independently recomputed
            # by the Decimal Python validator rather than approximated in JS.
            "formula_sample_metric_ids": [
                item["output_metric_id"]
                for item in sorted(formulas, key=lambda item: item["operation"] == "DATED_XIRR")[:10]
            ],
        },
    }
