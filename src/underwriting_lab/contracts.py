from __future__ import annotations

import hashlib
import json
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any

from ic_evidence_lab.canonical import canonical_json
from jsonschema import Draft202012Validator


CONTRACT_VERSION = "underwriting-econometrics/v2"
CUTOFF = "2026-08-29T00:00:00Z"
CLASSIFICATIONS = {
    "ACCOUNTING_IDENTITY",
    "DESCRIPTIVE",
    "PREDICTIVE_ASSOCIATION",
    "CAUSAL_SYNTHETIC_ONLY",
    "SCENARIO",
    "NOT_IDENTIFIED",
    "HUMAN_JUDGMENT",
}
RUNTIME_STATES = {"REPORTED", "DIAGNOSTIC_BLOCKED", "ABSTAIN", "NOT_APPLICABLE"}


class UnderwritingError(ValueError):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def digest(document: Any) -> str:
    return sha256_bytes(canonical_json(document))


def quantize(value: float | Decimal, places: str = "0.01") -> str:
    return format(Decimal(str(value)).quantize(Decimal(places), rounding=ROUND_HALF_EVEN), "f")


def write_json(path: Path, document: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_json(document) + b"\n")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_underwriting_schema(name: str) -> dict[str, Any]:
    if not name or "/" in name or "\\" in name or not name.endswith(".schema.json"):
        raise UnderwritingError("underwriting_schema_name_invalid")
    path = Path(__file__).resolve().parent / "schemas" / name
    if not path.is_file():
        raise UnderwritingError(f"underwriting_schema_missing:{name}")
    document = read_json(path)
    Draft202012Validator.check_schema(document)
    return document


def validate_v2_document(document: dict[str, Any], schema_name: str) -> None:
    errors = sorted(
        Draft202012Validator(load_underwriting_schema(schema_name)).iter_errors(document),
        key=lambda item: list(item.absolute_path),
    )
    if errors:
        path = "/".join(str(item) for item in errors[0].absolute_path) or "$"
        raise UnderwritingError(f"v2_schema_invalid:{schema_name}:{path}:{errors[0].message}")


def _validate_hashed_v2_document(document: dict[str, Any], schema_name: str) -> None:
    validate_v2_document(document, schema_name)
    body = dict(document)
    expected = body.pop("receipt_sha256", None)
    if expected != digest(body):
        raise UnderwritingError(f"v2_receipt_digest_mismatch:{schema_name}")


def _validate_named_hash(document: dict[str, Any], schema_name: str, field: str) -> None:
    validate_v2_document(document, schema_name)
    body = dict(document)
    expected = body.pop(field, None)
    if expected != digest(body):
        raise UnderwritingError(f"v2_digest_mismatch:{schema_name}:{field}")


def _validate_pe_payload(case: dict[str, Any]) -> None:
    engine = case.get("peEngine")
    if engine is None:
        return
    if not isinstance(engine.get("maximum_bid_cents"), int):
        raise UnderwritingError("pe_maximum_bid_integer_cents_required")
    for scenario_id in ("ask", "selected", "downside"):
        result = engine.get(scenario_id)
        if not isinstance(result, dict):
            raise UnderwritingError(f"pe_scenario_missing:{scenario_id}")
        _validate_hashed_v2_document(
            result["sources_and_uses"], "sources-and-uses-v2.schema.json"
        )
        _validate_hashed_v2_document(
            result["debt_schedule"], "debt-schedule-v2.schema.json"
        )
        _validate_hashed_v2_document(result, "pe-case-result-v2.schema.json")
    distribution = engine["distribution"]
    _validate_hashed_v2_document(distribution, "pe-distribution-v2.schema.json")
    if distribution["correlation_structure_sha256"] != digest(distribution["correlation_structure"]):
        raise UnderwritingError("pe_distribution_correlation_digest_mismatch")
    records = distribution["path_records"]
    result_hashes = distribution["path_receipt_sha256s"]
    if len(records) != distribution["draws"] or len(result_hashes) != distribution["draws"]:
        raise UnderwritingError("pe_distribution_path_count_mismatch")
    for record, result_hash in zip(records, result_hashes, strict=True):
        body = dict(record)
        expected = body.pop("receipt_sha256")
        if expected != digest(body):
            raise UnderwritingError("pe_distribution_path_digest_mismatch")
        if record["result_receipt_sha256"] != result_hash:
            raise UnderwritingError("pe_distribution_result_binding_mismatch")
        if any(int(value) != 0 for value in record["reconciliation"].values()):
            raise UnderwritingError("pe_distribution_path_reconciliation_failed")
        if record["xirr_status"] == "TOTAL_LOSS_BOUNDARY" and (
            Decimal(record["gross_moic"]) != 0 or Decimal(record["gross_xirr"]) != -1
        ):
            raise UnderwritingError("pe_distribution_total_loss_boundary_mismatch")
    quantile_indices = [
        int((Decimal(len(records) - 1) * probability).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))
        for probability in (Decimal("0.10"), Decimal("0.50"), Decimal("0.90"))
    ]
    moics = sorted(Decimal(record["gross_moic"]) for record in records)
    xirrs = sorted(Decimal(record["gross_xirr"]) for record in records)
    if [format(moics[index], "f") for index in quantile_indices] != distribution["moic_quantiles"]:
        raise UnderwritingError("pe_distribution_moic_quantile_mismatch")
    if [format(xirrs[index], "f") for index in quantile_indices] != distribution["xirr_quantiles"]:
        raise UnderwritingError("pe_distribution_xirr_quantile_mismatch")
    denominator = Decimal(len(records))
    probabilities = {
        "probability_below_one": Decimal(sum(value < 1 for value in moics)) / denominator,
        "probability_covenant_breach": Decimal(sum(record["first_covenant_breach_month"] is not None for record in records)) / denominator,
        "probability_payment_default": Decimal(sum(bool(record["payment_default"]) for record in records)) / denominator,
    }
    for name, value in probabilities.items():
        expected = value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN)
        if Decimal(distribution[name]) != expected:
            raise UnderwritingError(f"pe_distribution_probability_mismatch:{name}")
    sensitivity = engine.get("sensitivities")
    if not isinstance(sensitivity, dict):
        raise UnderwritingError("pe_sensitivity_book_missing")
    for cell in sensitivity["one_way"] + sensitivity["entry_exit_matrix"]:
        _validate_hashed_v2_document(cell, "pe-sensitivity-cell-v2.schema.json")
    _validate_hashed_v2_document(
        sensitivity, "pe-sensitivity-book-v2.schema.json"
    )
    bridge = case.get("valueCreationBridge")
    if not isinstance(bridge, dict):
        raise UnderwritingError("pe_value_creation_bridge_missing")
    _validate_hashed_v2_document(
        bridge, "pe-value-creation-bridge-v2.schema.json"
    )


def _validate_vc_payload(case: dict[str, Any]) -> None:
    engine = case.get("vcEngine")
    if case.get("caseId") != "helios":
        if engine is not None:
            raise UnderwritingError("vc_engine_wrong_case")
        return
    if not isinstance(engine, dict):
        raise UnderwritingError("vc_engine_missing")
    results: list[dict[str, Any]] = []
    expected_ids = {
        "base": "BASE",
        "milestone": "MILESTONE",
        "downside": "DOWNSIDE",
        "financing_shortfall": "FINANCING_SHORTFALL",
    }
    for key, scenario_id in expected_ids.items():
        result = engine.get(key)
        if not isinstance(result, dict) or result.get("scenario_id") != scenario_id:
            raise UnderwritingError(f"vc_scenario_missing:{scenario_id}")
        _validate_hashed_v2_document(result, "vc-case-result-v2.schema.json")
        waterfall = result["waterfall"]
        _validate_hashed_v2_document(waterfall, "vc-waterfall-v2.schema.json")
        if sum(waterfall["class_proceeds_cents"].values()) + waterfall[
            "common_proceeds_cents"
        ] != waterfall["exit_value_cents"]:
            raise UnderwritingError("vc_waterfall_conservation_failed")
        funded_target = 0
        engine_inputs = result["engine_inputs"]
        issued_shares = sum(
            int(holder["shares"]) for holder in engine_inputs["initial_holders"]
        )
        unissued_pool = int(engine_inputs["initial_unissued_pool_shares"])
        preference_invested = {
            item["class_id"]: int(item["invested_cents"])
            for item in engine_inputs["initial_preferences"]
        }
        previous_ending: int | None = None
        for event in result["financing_events"]:
            validate_v2_document(event, "vc-financing-event-v2.schema.json")
            event_body = dict(event)
            event_sha256 = event_body.pop("event_sha256")
            if event_sha256 != digest(event_body):
                raise UnderwritingError("vc_event_digest_mismatch")
            if event["status"] == "FUNDED" and event["holder_id"] == "series-c-investor":
                funded_target += event["new_money_cents"]
            if event["issued_shares_before"] != issued_shares or event[
                "unissued_pool_before"
            ] != unissued_pool:
                raise UnderwritingError("vc_event_opening_capitalization_mismatch")
            if event["status"] == "NOT_FUNDED":
                if any(
                    event[field] != 0
                    for field in ("new_money_cents", "new_shares", "pool_top_up_shares")
                ):
                    raise UnderwritingError("vc_unfunded_event_has_effect")
            else:
                from fractions import Fraction

                price = Fraction(
                    int(event["price_per_share_numerator_cents"]),
                    int(event["price_per_share_denominator"]),
                )
                apic = Fraction(
                    int(event["apic_remainder_numerator_cents"]),
                    int(event["apic_remainder_denominator"]),
                )
                if price * int(event["new_shares"]) + apic != int(
                    event["new_money_cents"]
                ):
                    raise UnderwritingError("vc_event_apic_reconciliation_failed")
                preference_invested[event["class_id"]] = preference_invested.get(
                    event["class_id"], 0
                ) + int(event["new_money_cents"])
            issued_shares += int(event["new_shares"])
            unissued_pool += int(event["pool_top_up_shares"])
            if event["issued_shares_after"] != issued_shares or event[
                "unissued_pool_after"
            ] != unissued_pool:
                raise UnderwritingError("vc_event_closing_capitalization_mismatch")
            if event["fully_diluted_after"] != issued_shares + unissued_pool:
                raise UnderwritingError("vc_event_fully_diluted_mismatch")
            if event["event_type"] == "MILESTONE":
                milestone_states = {
                    metric_id: state for metric_id, state in event["milestone_results"]
                }
                derived_pass = bool(milestone_states) and all(
                    state == "PASS" for state in milestone_states.values()
                )
                if (event["status"] == "FUNDED") != derived_pass:
                    raise UnderwritingError("vc_milestone_funding_not_derived")
        if funded_target != result["target_invested_cents"]:
            raise UnderwritingError("vc_target_investment_reconciliation_failed")
        if sum(int(holder["shares"]) for holder in result["holders"]) != issued_shares:
            raise UnderwritingError("vc_holder_share_rollforward_failed")
        if int(result["unissued_pool_shares"]) != unissued_pool:
            raise UnderwritingError("vc_pool_share_rollforward_failed")
        for preference in result["preferences"]:
            if int(preference["invested_cents"]) != preference_invested[
                preference["class_id"]
            ]:
                raise UnderwritingError("vc_preference_rollforward_failed")
        target_holder = next(
            holder
            for holder in result["holders"]
            if holder["holder_id"] == "series-c-investor"
        )
        fully_diluted = issued_shares + unissued_pool
        expected_ownership = (
            Decimal(int(target_holder["shares"])) / Decimal(fully_diluted)
        ).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_EVEN)
        if Decimal(result["target_ownership"]) != expected_ownership:
            raise UnderwritingError("vc_target_ownership_reconciliation_failed")
        target_flows = result["target_cash_flows"]
        if -sum(min(0, int(flow["amount_cents"])) for flow in target_flows) != result[
            "target_invested_cents"
        ] or sum(max(0, int(flow["amount_cents"])) for flow in target_flows) != result[
            "target_proceeds_cents"
        ]:
            raise UnderwritingError("vc_target_cash_flow_reconciliation_failed")
        expected_moic = (
            Decimal(result["target_proceeds_cents"])
            / Decimal(result["target_invested_cents"])
        ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN)
        if Decimal(result["gross_moic"]) != expected_moic:
            raise UnderwritingError("vc_target_moic_reconciliation_failed")
        from datetime import date

        from .finance import DatedCashFlow, xirr

        expected_xirr = xirr(
            tuple(
                DatedCashFlow(
                    date.fromisoformat(flow["date"]), int(flow["amount_cents"])
                )
                for flow in target_flows
            )
        )
        if Decimal(result["gross_xirr"]) != expected_xirr:
            raise UnderwritingError("vc_target_xirr_reconciliation_failed")
        for row in result["cash_by_month"]:
            if previous_ending is not None and row["beginning_cash_cents"] != previous_ending:
                raise UnderwritingError("vc_cash_opening_mismatch")
            expected_ending = (
                row["beginning_cash_cents"]
                + row["financing_cash_cents"]
                + row["operating_net_cash_flow_cents"]
            )
            if row["ending_cash_cents"] != expected_ending:
                raise UnderwritingError("vc_cash_rollforward_failed")
            previous_ending = row["ending_cash_cents"]
        if Decimal(result["xirr_npv_residual_cents"]) > 1:
            raise UnderwritingError("vc_xirr_npv_residual_failed")
        results.append(result)
    if len({item["engine_inputs_sha256"] for item in results}) != 4:
        raise UnderwritingError("vc_scenario_input_digest_duplicate")
    if len({item["receipt_sha256"] for item in results}) != 4:
        raise UnderwritingError("vc_scenario_result_digest_duplicate")
    distribution = engine["distribution"]
    _validate_hashed_v2_document(distribution, "vc-distribution-v2.schema.json")
    if distribution["base_result_receipt_sha256"] != engine["milestone"]["receipt_sha256"]:
        raise UnderwritingError("vc_distribution_base_binding_mismatch")
    template_weights = {
        key: Decimal(value) for key, value in distribution["template_weights"].items()
    }
    if set(template_weights) != {"MILESTONE", "BASE", "DOWNSIDE", "FINANCING_SHORTFALL"}:
        raise UnderwritingError("vc_distribution_weight_keys_invalid")
    if any(value <= 0 for value in template_weights.values()):
        raise UnderwritingError("vc_distribution_weight_nonpositive")
    if sum(template_weights.values(), Decimal("0")) != Decimal("1"):
        raise UnderwritingError("vc_distribution_weights_do_not_sum_to_one")
    records = distribution["path_records"]
    if len(records) != distribution["draws"]:
        raise UnderwritingError("vc_distribution_path_count_mismatch")
    for record in records:
        record_body = dict(record)
        expected = record_body.pop("receipt_sha256")
        if expected != digest(record_body):
            raise UnderwritingError("vc_distribution_path_digest_mismatch")
    sensitivity = engine["sensitivities"]
    sensitivity_body = dict(sensitivity)
    sensitivity_sha256 = sensitivity_body.pop("receipt_sha256")
    if sensitivity_sha256 != digest(sensitivity_body):
        raise UnderwritingError("vc_sensitivity_book_digest_mismatch")
    if sensitivity["axis_order"] != [
        "exit_value",
        "exit_date",
        "later_round_price",
        "milestone_state",
    ]:
        raise UnderwritingError("vc_sensitivity_axes_invalid")
    for cell in sensitivity["cells"]:
        body = dict(cell)
        expected = body.pop("receipt_sha256")
        if expected != digest(body):
            raise UnderwritingError("vc_sensitivity_cell_digest_mismatch")
    if {cell["axis"] for cell in sensitivity["cells"]} != set(sensitivity["axis_order"]):
        raise UnderwritingError("vc_sensitivity_axis_missing")
    quantile_indices = [
        int((Decimal(len(records) - 1) * probability).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))
        for probability in (Decimal("0.10"), Decimal("0.50"), Decimal("0.90"))
    ]
    for field, output in (("gross_moic", "moic_quantiles"), ("gross_xirr", "xirr_quantiles")):
        values = sorted(Decimal(record[field]) for record in records)
        if [format(values[index], "f") for index in quantile_indices] != distribution[output]:
            raise UnderwritingError(f"vc_distribution_quantile_mismatch:{field}")
    bridge = case.get("vcValueCreationBridge")
    if not isinstance(bridge, dict):
        raise UnderwritingError("vc_value_creation_bridge_missing")
    bridge_body = dict(bridge)
    expected = bridge_body.pop("receipt_sha256")
    if expected != digest(bridge_body):
        raise UnderwritingError("vc_value_creation_bridge_digest_mismatch")
    for lever in bridge["standalone"]:
        body = dict(lever)
        expected = body.pop("receipt_sha256")
        if expected != digest(body):
            raise UnderwritingError("vc_value_creation_lever_digest_mismatch")
    if bridge["combined_target_proceeds_delta_cents"] != (
        bridge["sum_standalone_target_proceeds_delta_cents"]
        + bridge["interaction_residual_cents"]
    ):
        raise UnderwritingError("vc_value_creation_interaction_mismatch")


def _validate_metric_contract(case: dict[str, Any]) -> None:
    artifacts = {item["artifact_id"]: item for item in case["artifacts"]}
    analyses = {item["analysis_id"] for item in case["analyses"]}
    locators: dict[str, dict[str, Any]] = {}
    for locator in case["sourceLocators"]:
        _validate_named_hash(locator, "source-locator-v2.schema.json", "locator_sha256")
        locator_id = locator["locator_id"]
        if locator_id in locators:
            raise UnderwritingError("source_locator_duplicate")
        locators[locator_id] = locator
        artifact = artifacts.get(locator["artifact_id"])
        if artifact is None or artifact["path"] != locator["artifact_path"] or artifact["sha256"] != locator["artifact_sha256"]:
            raise UnderwritingError("source_locator_artifact_mismatch")
        if locator["analysis_id"] not in analyses:
            raise UnderwritingError("source_locator_analysis_orphan")

    metrics: dict[str, dict[str, Any]] = {}
    for metric in case["metricRegistry"]:
        _validate_named_hash(metric, "typed-metric-v2.schema.json", "metric_sha256")
        metric_id = metric["metric_id"]
        if metric_id in metrics:
            raise UnderwritingError("metric_registry_duplicate")
        metrics[metric_id] = metric
        if not set(metric["source_locator_ids"]).issubset(locators):
            raise UnderwritingError("metric_source_locator_orphan")
        if not metric["source_locator_ids"] and not metric["operand_ids"] and not metric["assumption_ids"]:
            raise UnderwritingError("metric_provenance_missing")

    formulas: dict[str, dict[str, Any]] = {}
    for formula in case["formulaRegistry"]:
        _validate_named_hash(formula, "formula-registry-entry-v2.schema.json", "formula_sha256")
        formula_id = formula["formula_id"]
        if formula_id in formulas:
            raise UnderwritingError("formula_registry_duplicate")
        formulas[formula_id] = formula
        if formula["output_metric_id"] not in metrics or not set(formula["operand_ids"]).issubset(metrics):
            raise UnderwritingError("formula_metric_orphan")
        output = metrics[formula["output_metric_id"]]
        if output["formula_id"] != formula_id or output["operand_ids"] != formula["operand_ids"]:
            raise UnderwritingError("formula_output_binding_mismatch")
        values = [Decimal(metrics[item]["value"]) for item in formula["operand_ids"]]
        left, right = values[:2]
        operation = formula["operation"]
        if operation == "ADD":
            expected = left + right
        elif operation == "SUBTRACT":
            expected = left - right
        elif operation == "MULTIPLY":
            expected = left * right
        elif operation == "DIVIDE":
            if right == 0:
                raise UnderwritingError("formula_division_by_zero")
            expected = left / right
        elif operation == "MIN":
            expected = min(left, right)
        elif operation == "SUM":
            expected = sum(values)
        elif operation == "DATED_XIRR":
            from datetime import date

            from .finance import DatedCashFlow, xirr

            expected = xirr(
                tuple(
                    DatedCashFlow(
                        date.fromisoformat(metrics[item]["period"]),
                        int(Decimal(metrics[item]["value"])),
                    )
                    for item in formula["operand_ids"]
                )
            )
        else:
            expected = max(left, right)
        expected = expected.quantize(
            Decimal(output["quantum"]), rounding=ROUND_HALF_EVEN
        )
        if Decimal(output["value"]) != expected:
            raise UnderwritingError(f"formula_value_mismatch:{formula_id}")

    render_ids = case["renderManifest"]["metric_ids"]
    if not set(render_ids).issubset(metrics):
        raise UnderwritingError("render_manifest_metric_orphan")
    sample_ids = case["renderManifest"]["formula_sample_metric_ids"]
    if not set(sample_ids).issubset(metrics):
        raise UnderwritingError("formula_sample_metric_orphan")
    if any(metrics[item]["formula_id"] is None for item in sample_ids):
        raise UnderwritingError("formula_sample_not_derived")
    if case["caseId"] in {"atlasgrid", "helios"} and len(sample_ids) != 10:
        raise UnderwritingError(f"{case['caseId']}_formula_sample_requires_ten")
    if case["caseId"] == "helios":
        milestone = case["vcEngine"]["milestone_contract"]
        lineage_ids = {item["node_id"] for item in case["lineage"]}
        for test in milestone["tests"]:
            if test["metric_id"] not in metrics:
                raise UnderwritingError("vc_milestone_metric_orphan")
            if test["evidence_locator"] not in lineage_ids:
                raise UnderwritingError("vc_milestone_locator_orphan")


def validate_workbench_data(document: dict[str, Any]) -> None:
    validate_v2_document(document, "workbench-data-v2.schema.json")
    case_ids = [case["caseId"] for case in document["cases"]]
    if sorted(case_ids) != ["atlasgrid", "helios"]:
        raise UnderwritingError("workbench_requires_exactly_atlasgrid_and_helios")
    for case in document["cases"]:
        validate_workbench_case(case)


def analysis_receipt(
    *,
    analysis_id: str,
    question: str,
    classification: str,
    method: str,
    population: str,
    inputs: list[dict[str, str]],
    outputs: list[dict[str, str]],
    assumptions: list[str],
    diagnostics: list[dict[str, str]],
    state: str = "REPORTED",
) -> dict[str, Any]:
    if classification not in CLASSIFICATIONS:
        raise UnderwritingError("analysis_classification_invalid")
    if state not in RUNTIME_STATES:
        raise UnderwritingError("analysis_state_invalid")
    if classification == "PREDICTIVE_ASSOCIATION" and not any(
        item["name"] in {"standard_error", "confidence_interval", "credible_interval"}
        for item in diagnostics
    ):
        raise UnderwritingError("predictive_uncertainty_required")
    if classification == "CAUSAL_SYNTHETIC_ONLY" and not any(
        item["name"] == "assignment_mechanism" for item in diagnostics
    ):
        raise UnderwritingError("causal_assignment_required")
    body: dict[str, Any] = {
        "schema_version": "underwriting.analysis-receipt/v1",
        "analysis_id": analysis_id,
        "question": question,
        "classification": classification,
        "method": method,
        "population": population,
        "cutoff": CUTOFF,
        "inputs": inputs,
        "outputs": outputs,
        "assumptions": assumptions,
        "diagnostics": diagnostics,
        "state": state,
    }
    body["receipt_sha256"] = digest(body)
    return body


def lineage_item(
    *,
    node_id: str,
    label: str,
    artifact_id: str,
    field: str,
    analysis_id: str,
    output_names: list[str],
    transformation: str,
    downstream: str,
) -> dict[str, Any]:
    return {
        "node_id": node_id,
        "label": label,
        "artifact_id": artifact_id,
        "field": field,
        "analysis_id": analysis_id,
        "output_names": output_names,
        "transformation": transformation,
        "downstream": downstream,
    }


def validate_workbench_case(case: dict[str, Any]) -> None:
    is_v2 = case.get("schema_version") == "underwriting.workbench-case/v2"
    if is_v2:
        validate_v2_document(case, "workbench-case-v2.schema.json")
        _validate_hashed_v2_document(case["temporalScan"], "temporal-scan-v1.schema.json")
        if case["temporalScan"]["cutoff"] != CUTOFF or case["decision"].get("as_of") != CUTOFF:
            raise UnderwritingError("temporal_cutoff_mismatch")
        if any(receipt["cutoff"] != CUTOFF for receipt in case["analyses"]):
            raise UnderwritingError("analysis_cutoff_mismatch")
    _validate_pe_payload(case)
    _validate_vc_payload(case)
    body = dict(case)
    expected = body.pop("analysis_sha256", None)
    if expected != digest(body):
        raise UnderwritingError("analysis_digest_mismatch")
    artifacts = {item["artifact_id"]: item for item in case["artifacts"]}
    analyses = {item["analysis_id"]: item for item in case["analyses"]}
    if len(artifacts) != len(case["artifacts"]) or len(analyses) != len(case["analyses"]):
        raise UnderwritingError("workbench_identifier_duplicate")
    decision = dict(case["decision"])
    decision_digest = decision.pop("decision_sha256", None)
    if decision_digest != digest(decision):
        raise UnderwritingError("decision_digest_mismatch")
    for receipt in case["analyses"]:
        receipt_body = dict(receipt)
        receipt_digest = receipt_body.pop("receipt_sha256", None)
        if receipt_digest != digest(receipt_body):
            raise UnderwritingError("analysis_receipt_digest_mismatch")
    scenario = dict(case["scenarioBook"])
    scenario_digest = scenario.pop("scenario_sha256", None)
    if scenario_digest != digest(scenario):
        raise UnderwritingError("scenario_digest_mismatch")
    graph = dict(case["thesisGraph"])
    graph_digest = graph.pop("graph_sha256", None)
    if graph_digest != digest(graph):
        raise UnderwritingError("thesis_graph_digest_mismatch")
    graph_nodes = {node["node_id"] for node in case["thesisGraph"]["nodes"]}
    if len(graph_nodes) != len(case["thesisGraph"]["nodes"]):
        raise UnderwritingError("thesis_graph_node_duplicate")
    if any(edge["from"] not in graph_nodes or edge["to"] not in graph_nodes for edge in case["thesisGraph"]["edges"]):
        raise UnderwritingError("thesis_graph_edge_orphan")
    graph_adjacency: dict[str, set[str]] = {node_id: set() for node_id in graph_nodes}
    for edge in case["thesisGraph"]["edges"]:
        graph_adjacency[edge["from"]].add(edge["to"])
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node_id: str) -> None:
        if node_id in visiting:
            raise UnderwritingError("thesis_graph_cycle")
        if node_id in visited:
            return
        visiting.add(node_id)
        for next_id in graph_adjacency[node_id]:
            visit(next_id)
        visiting.remove(node_id)
        visited.add(node_id)

    for graph_node_id in graph_nodes:
        visit(graph_node_id)
    lineage = {item["node_id"]: item for item in case["lineage"]}
    if len(lineage) != len(case["lineage"]):
        raise UnderwritingError("lineage_node_duplicate")
    for item in lineage.values():
        if item["artifact_id"] not in artifacts or item["analysis_id"] not in analyses:
            raise UnderwritingError("lineage_reference_orphan")
        receipt = analyses[item["analysis_id"]]
        input_ids = {source["artifact_id"] for source in receipt["inputs"]}
        output_names = {output["name"] for output in receipt["outputs"]}
        if item["artifact_id"] not in input_ids or not set(item["output_names"]).issubset(output_names):
            raise UnderwritingError("lineage_operand_unbound")
        if not item["transformation"] or not item["downstream"]:
            raise UnderwritingError("lineage_explanation_missing")
    for metric in case["summaryMetrics"]:
        if not metric["lineage"] or not set(metric["lineage"]).issubset(lineage):
            raise UnderwritingError("headline_lineage_invalid")
    for scenario_item in case["scenarioBook"]["scenarios"]:
        if not scenario_item["lineage"] or not set(scenario_item["lineage"]).issubset(lineage):
            raise UnderwritingError("scenario_lineage_invalid")
    if case["distributionLineage"] not in lineage:
        raise UnderwritingError("distribution_lineage_invalid")
    if is_v2:
        _validate_metric_contract(case)
