from __future__ import annotations

import hashlib
import json
import re
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
    for scenario_id in ("ask", "selected", "downside", "maximum_bid_base", "maximum_bid_downside"):
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
        expected_se_pp = (
            (expected * (Decimal(1) - expected) / denominator).sqrt()
            * Decimal(100)
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
        if Decimal(distribution[f"{name}_monte_carlo_se_pp"]) != expected_se_pp:
            raise UnderwritingError(f"pe_distribution_monte_carlo_se_mismatch:{name}")
    if probabilities["probability_covenant_breach"] <= 0:
        raise UnderwritingError("pe_distribution_covenant_stress_nonbinding")
    prior = distribution["correlation_structure"]
    if prior.get("classification") != "SYNTHETIC_SCENARIO_NOT_FORECAST" or not prior.get("rationale"):
        raise UnderwritingError("pe_distribution_prior_boundary_missing")
    if not (
        Decimal(prior["loss_probability_band_low"])
        <= probabilities["probability_below_one"]
        <= Decimal(prior["loss_probability_band_high"])
    ):
        raise UnderwritingError("pe_distribution_probability_outside_prior_band")
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
    pe_bridge_fields = (
        ("exit_ebitda_cents", "exit_ebitda_delta_cents"),
        ("exit_debt_cents", "exit_debt_delta_cents"),
        ("exit_equity_cents", "exit_equity_delta_cents"),
        ("gross_xirr", "gross_xirr_delta"),
        ("gross_moic", "gross_moic_delta"),
    )
    for lever in bridge["standalone"]:
        for absolute_field, delta_field in pe_bridge_fields:
            result = Decimal(str(lever[f"result_{absolute_field}"]))
            base = Decimal(str(bridge[f"base_{absolute_field}"]))
            if result - base != Decimal(str(lever[delta_field])):
                raise UnderwritingError(f"pe_value_creation_absolute_delta_mismatch:{lever['lever_id']}:{delta_field}")
    if Decimal(bridge["combined_exit_equity_cents"]) - Decimal(bridge["base_exit_equity_cents"]) != Decimal(bridge["combined_exit_equity_delta_cents"]):
        raise UnderwritingError("pe_value_creation_combined_equity_mismatch")
    if Decimal(bridge["combined_gross_xirr"]) - Decimal(bridge["base_gross_xirr"]) != Decimal(bridge["combined_gross_xirr_delta"]):
        raise UnderwritingError("pe_value_creation_combined_xirr_mismatch")
    if Decimal(bridge["combined_gross_moic"]) - Decimal(bridge["base_gross_moic"]) != Decimal(bridge["combined_gross_moic_delta"]):
        raise UnderwritingError("pe_value_creation_combined_moic_mismatch")


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
    exit_bridges = engine.get("operating_exit_bridges")
    if not isinstance(exit_bridges, dict) or set(exit_bridges) != set(expected_ids):
        raise UnderwritingError("vc_operating_exit_bridge_set_invalid")
    for key, scenario_id in expected_ids.items():
        result = engine.get(key)
        if not isinstance(result, dict) or result.get("scenario_id") != scenario_id:
            raise UnderwritingError(f"vc_scenario_missing:{scenario_id}")
        _validate_hashed_v2_document(result, "vc-case-result-v2.schema.json")
        if result.get("pool_exit_treatment") != "FULLY_GRANTED_COMMON":
            raise UnderwritingError("vc_primary_pool_exit_treatment_invalid")
        waterfall = result["waterfall"]
        _validate_hashed_v2_document(waterfall, "vc-waterfall-v2.schema.json")
        if sum(waterfall["class_proceeds_cents"].values()) + waterfall[
            "common_proceeds_cents"
        ] != waterfall["exit_value_cents"]:
            raise UnderwritingError("vc_waterfall_conservation_failed")
        funded_target = 0
        engine_inputs = result["engine_inputs"]
        exit_bridge = exit_bridges[key]
        if engine_inputs.get("exit_valuation") != exit_bridge:
            raise UnderwritingError("vc_operating_exit_bridge_input_mismatch")
        terminal_revenue = int(
            (
                Decimal(exit_bridge["observed_ltm_revenue_cents"])
                * (Decimal(1) + Decimal(exit_bridge["annual_revenue_growth"]))
                ** int(exit_bridge["years"])
            ).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
        )
        enterprise_value = int(
            (Decimal(terminal_revenue) * Decimal(exit_bridge["exit_revenue_multiple"])).quantize(
                Decimal("1"), rounding=ROUND_HALF_EVEN
            )
        )
        equity_value = enterprise_value - int(exit_bridge["net_debt_cents"])
        exit_cash = int(result["cash_by_month"][-1]["ending_cash_cents"])
        if (
            terminal_revenue != exit_bridge["terminal_revenue_cents"]
            or enterprise_value != exit_bridge["exit_enterprise_value_cents"]
            or equity_value != exit_bridge["exit_equity_value_cents"]
            or equity_value != waterfall["exit_value_cents"]
            or exit_bridge.get("cash_at_exit_cents") != exit_cash
            or exit_bridge["net_debt_cents"] != -exit_cash
        ):
            raise UnderwritingError("vc_operating_exit_bridge_reconciliation_failed")
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
    priors = dict(distribution["priors"])
    prior_digest = priors.pop("receipt_sha256", None)
    if prior_digest != digest(priors):
        raise UnderwritingError("vc_distribution_priors_digest_mismatch")
    if priors.get("classification") != "SYNTHETIC_SCENARIO_NOT_FORECAST":
        raise UnderwritingError("vc_distribution_priors_classification_invalid")
    if (
        priors.get("input_classification") != "ANALYST_SCENARIO_ASSUMPTION"
        or priors.get("approval_status") not in {"UNREVIEWED", "APPROVED", "REJECTED"}
        or not priors.get("owner")
    ):
        raise UnderwritingError("vc_distribution_priors_governance_invalid")
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
    risk_policy = engine.get("risk_policy")
    if not isinstance(risk_policy, dict):
        raise UnderwritingError("vc_risk_policy_missing")
    _validate_hashed_v2_document(risk_policy, "vc-risk-policy-v1.schema.json")
    policy_threshold = Decimal(risk_policy["maximum_probability_below_one"])
    policy_choices = [Decimal(value) for value in risk_policy["editable_maximum_probability_choices"]]
    if not Decimal("0") <= policy_threshold <= Decimal("1") or policy_threshold not in policy_choices:
        raise UnderwritingError("vc_risk_policy_threshold_invalid")
    if any(value < 0 or value > 1 for value in policy_choices):
        raise UnderwritingError("vc_risk_policy_choices_invalid")
    risk_sensitivity = engine.get("risk_sensitivity")
    if not isinstance(risk_sensitivity, dict):
        raise UnderwritingError("vc_risk_sensitivity_missing")
    _validate_hashed_v2_document(risk_sensitivity, "vc-risk-sensitivity-v1.schema.json")
    if Decimal(risk_sensitivity["canonical_policy_threshold"]) != policy_threshold:
        raise UnderwritingError("vc_risk_sensitivity_policy_binding_mismatch")
    if [Decimal(value) for value in risk_sensitivity["policy_threshold_choices"]] != policy_choices:
        raise UnderwritingError("vc_risk_sensitivity_policy_choices_mismatch")
    risk_cells = risk_sensitivity["cells"]
    if len({cell["cell_id"] for cell in risk_cells}) != len(risk_cells):
        raise UnderwritingError("vc_risk_sensitivity_cell_duplicate")
    canonical_cells = [cell for cell in risk_cells if cell["is_canonical"]]
    if len(canonical_cells) != 1:
        raise UnderwritingError("vc_risk_sensitivity_canonical_count_invalid")
    canonical_risk_cell = canonical_cells[0]
    if (
        canonical_risk_cell["cell_id"] != risk_sensitivity["canonical_cell_id"]
        or risk_sensitivity["default_cell_id"] != risk_sensitivity["canonical_cell_id"]
        or Decimal(canonical_risk_cell["catastrophe_probability"])
        != Decimal(priors["catastrophe_probability"])
        or {key: Decimal(value) for key, value in canonical_risk_cell["template_weights"].items()}
        != template_weights
        or canonical_risk_cell["distribution_receipt_sha256"] != distribution["receipt_sha256"]
        or Decimal(canonical_risk_cell["probability_below_one"])
        != Decimal(distribution["probability_below_one"])
    ):
        raise UnderwritingError("vc_risk_sensitivity_canonical_binding_mismatch")
    for cell in risk_cells:
        body = dict(cell)
        expected = body.pop("receipt_sha256")
        if expected != digest(body):
            raise UnderwritingError("vc_risk_sensitivity_cell_digest_mismatch")
        weights = {key: Decimal(value) for key, value in cell["template_weights"].items()}
        if set(weights) != set(template_weights) or any(value <= 0 for value in weights.values()) or sum(weights.values(), Decimal("0")) != Decimal("1"):
            raise UnderwritingError("vc_risk_sensitivity_weights_invalid")
        decomposition = cell["loss_decomposition"]
        if decomposition["catastrophe_paths"] + decomposition["continuous_paths"] != cell["draws"]:
            raise UnderwritingError("vc_risk_sensitivity_path_decomposition_mismatch")
        loss_count = decomposition["catastrophe_loss_paths"] + decomposition["continuous_loss_paths"]
        expected_probability = (Decimal(loss_count) / Decimal(cell["draws"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN)
        if Decimal(cell["probability_below_one"]) != expected_probability:
            raise UnderwritingError("vc_risk_sensitivity_loss_decomposition_mismatch")
        expected_status = "CLEARS" if expected_probability <= policy_threshold else "MISSES"
        if cell["canonical_policy_status"] != expected_status or cell["analytical_posture"] != "HOLD":
            raise UnderwritingError("vc_risk_sensitivity_posture_invalid")
    sensitivity = engine["sensitivities"]
    sensitivity_body = dict(sensitivity)
    sensitivity_sha256 = sensitivity_body.pop("receipt_sha256")
    if sensitivity_sha256 != digest(sensitivity_body):
        raise UnderwritingError("vc_sensitivity_book_digest_mismatch")
    expected_axes = [
        "annual_revenue_growth",
        "exit_revenue_multiple",
        "ordinary_cohort_nrr",
        "later_round_price",
        "milestone_state",
    ]
    if sensitivity.get("schema_version") != "underwriting.vc-sensitivity-book/v3":
        raise UnderwritingError("vc_sensitivity_version_invalid")
    if sensitivity["axis_order"] != expected_axes:
        raise UnderwritingError("vc_sensitivity_axes_invalid")
    for cell in sensitivity["cells"]:
        body = dict(cell)
        expected = body.pop("receipt_sha256")
        if expected != digest(body):
            raise UnderwritingError("vc_sensitivity_cell_digest_mismatch")
    if {cell["axis"] for cell in sensitivity["cells"]} != set(sensitivity["axis_order"]):
        raise UnderwritingError("vc_sensitivity_axis_missing")
    if [item["axis"] for item in sensitivity.get("axis_definitions", [])] != expected_axes:
        raise UnderwritingError("vc_sensitivity_axis_definitions_invalid")
    baseline_cell_ids = sensitivity.get("baseline_cell_ids", {})
    if set(baseline_cell_ids) != set(expected_axes):
        raise UnderwritingError("vc_sensitivity_baseline_map_invalid")
    for axis in expected_axes:
        axis_cells = [cell for cell in sensitivity["cells"] if cell["axis"] == axis]
        baselines = [cell for cell in axis_cells if cell.get("is_baseline")]
        if len(baselines) != 1 or baseline_cell_ids[axis] != baselines[0]["cell_id"]:
            raise UnderwritingError(f"vc_sensitivity_baseline_invalid:{axis}")
    if sensitivity.get("default_axis") not in expected_axes:
        raise UnderwritingError("vc_sensitivity_default_axis_invalid")
    if sensitivity.get("default_cell_id") != baseline_cell_ids[sensitivity["default_axis"]]:
        raise UnderwritingError("vc_sensitivity_default_cell_invalid")
    for cell in sensitivity["cells"]:
        bridge = cell.get("operating_exit_bridge")
        if not isinstance(bridge, dict):
            raise UnderwritingError("vc_sensitivity_operating_bridge_missing")
        terminal_revenue = int(
            (
                Decimal(int(bridge["observed_ltm_revenue_cents"]))
                * (Decimal(1) + Decimal(str(bridge["annual_revenue_growth"])))
                ** int(bridge["years"])
            ).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
        )
        enterprise_value = int(
            (terminal_revenue * Decimal(str(bridge["exit_revenue_multiple"]))).quantize(
                Decimal("1"), rounding=ROUND_HALF_EVEN
            )
        )
        if (
            terminal_revenue != int(bridge["terminal_revenue_cents"])
            or enterprise_value != int(bridge["exit_enterprise_value_cents"])
            or int(bridge["cash_at_exit_cents"]) != cell["ending_cash_path_cents"][-1]
            or int(bridge["net_debt_cents"]) != -int(bridge["cash_at_exit_cents"])
            or int(bridge["exit_equity_value_cents"])
            != enterprise_value + int(bridge["cash_at_exit_cents"])
        ):
            raise UnderwritingError("vc_sensitivity_operating_bridge_mismatch")
        expected_loss_status = "CLEARS" if Decimal(distribution["probability_below_one"]) <= policy_threshold else "MISSES"
        if cell.get("binding_loss_hurdle_status") != expected_loss_status or cell.get("analytical_posture") != "HOLD":
            raise UnderwritingError("vc_sensitivity_binding_posture_invalid")
    quantile_indices = [
        int((Decimal(len(records) - 1) * probability).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))
        for probability in (Decimal("0.10"), Decimal("0.50"), Decimal("0.90"))
    ]
    for field, output in (("gross_moic", "moic_quantiles"), ("gross_xirr", "xirr_quantiles")):
        values = sorted(Decimal(record[field]) for record in records)
        if [format(values[index], "f") for index in quantile_indices] != distribution[output]:
            raise UnderwritingError(f"vc_distribution_quantile_mismatch:{field}")
    below_one = (
        Decimal(sum(Decimal(record["gross_moic"]) < 1 for record in records))
        / Decimal(len(records))
    ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN)
    if Decimal(distribution["probability_below_one"]) != below_one:
        raise UnderwritingError("vc_distribution_probability_mismatch")
    if not (
        Decimal(priors["loss_probability_band_low"])
        <= below_one
        <= Decimal(priors["loss_probability_band_high"])
    ):
        raise UnderwritingError("vc_distribution_probability_outside_prior_band")
    expected_se_pp = (
        (below_one * (Decimal(1) - below_one) / Decimal(len(records))).sqrt()
        * Decimal(100)
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
    if Decimal(distribution["probability_below_one_monte_carlo_se_pp"]) != expected_se_pp:
        raise UnderwritingError("vc_distribution_monte_carlo_se_mismatch")
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
        for result_field, base_field, delta_field in (
            ("result_minimum_cash_cents", "base_minimum_cash_cents", "minimum_cash_delta_cents"),
            ("result_target_proceeds_cents", "base_target_proceeds_cents", "target_proceeds_delta_cents"),
            ("result_gross_xirr", "base_gross_xirr", "gross_xirr_delta"),
            ("result_gross_moic", "base_gross_moic", "gross_moic_delta"),
        ):
            if Decimal(str(lever[result_field])) - Decimal(str(bridge[base_field])) != Decimal(str(lever[delta_field])):
                raise UnderwritingError(f"vc_value_creation_absolute_delta_mismatch:{lever['lever_id']}:{delta_field}")
    if bridge["combined_target_proceeds_delta_cents"] != (
        bridge["sum_standalone_target_proceeds_delta_cents"]
        + bridge["interaction_residual_cents"]
    ):
        raise UnderwritingError("vc_value_creation_interaction_mismatch")
    for result_field, base_field, delta_field in (
        ("combined_result_minimum_cash_cents", "base_minimum_cash_cents", "combined_minimum_cash_delta_cents"),
        ("combined_result_target_proceeds_cents", "base_target_proceeds_cents", "combined_target_proceeds_delta_cents"),
        ("combined_result_gross_xirr", "base_gross_xirr", "combined_gross_xirr_delta"),
        ("combined_result_gross_moic", "base_gross_moic", "combined_gross_moic_delta"),
    ):
        if Decimal(str(bridge[result_field])) - Decimal(str(bridge[base_field])) != Decimal(str(bridge[delta_field])):
            raise UnderwritingError(f"vc_value_creation_combined_absolute_delta_mismatch:{delta_field}")


def _validate_metric_semantic_binding(case: dict[str, Any]) -> None:
    """Bind the complete generated calculation contract to engine objects."""

    from .metric_registry import build_case_metric_contract

    rebuilt_contract = build_case_metric_contract(
        case,
        compiled_source_locators=case["sourceLocators"],
    )
    for contract_name in ("metricRegistry", "formulaRegistry", "renderManifest"):
        if case[contract_name] != rebuilt_contract[contract_name]:
            raise UnderwritingError(
                f"metric_contract_semantic_binding_mismatch:{contract_name}"
            )


def _validate_metric_contract(case: dict[str, Any]) -> None:
    artifacts = {item["artifact_id"]: item for item in case["artifacts"]}
    analyses = {item["analysis_id"] for item in case["analyses"]}
    locators: dict[str, dict[str, Any]] = {}
    for locator in case["sourceLocators"]:
        _validate_named_hash(locator, "source-locator-v3.schema.json", "locator_sha256")
        locator_id = locator["locator_id"]
        if locator_id in locators:
            raise UnderwritingError("source_locator_duplicate")
        locators[locator_id] = locator
        artifact = artifacts.get(locator["artifact_id"])
        if artifact is None or artifact["path"] != locator["artifact_path"] or artifact["sha256"] != locator["artifact_sha256"]:
            raise UnderwritingError("source_locator_artifact_mismatch")
        if locator["analysis_id"] not in analyses:
            raise UnderwritingError("source_locator_analysis_orphan")
        if digest(locator["retained_excerpt"]) != locator["excerpt_sha256"]:
            raise UnderwritingError("source_locator_excerpt_digest_mismatch")
        expected_repository_path = (
            f"portfolio/{case['caseId']}/data-room/{locator['artifact_path']}"
        )
        expected_published_path = (
            f"source-pack/{case['caseId']}/{locator['artifact_path']}"
        )
        if (
            locator["repository_path"] != expected_repository_path
            or locator["published_path"] != expected_published_path
        ):
            raise UnderwritingError("source_locator_public_path_mismatch")

    expected_input_pairs = {
        (receipt["analysis_id"], input_item["artifact_id"])
        for receipt in case["analyses"]
        for input_item in receipt["inputs"]
    }
    observed_input_pairs = {
        (locator["analysis_id"], locator["artifact_id"])
        for locator in locators.values()
    }
    if observed_input_pairs != expected_input_pairs:
        raise UnderwritingError("source_locator_input_closure_mismatch")

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

    for receipt in case["analyses"]:
        for output in receipt["outputs"]:
            metric_id = (
                f"{case['caseId']}-{receipt['analysis_id'].lower()}-{output['name']}"
            )
            metric = metrics.get(metric_id)
            if metric is None:
                raise UnderwritingError(f"analysis_output_metric_missing:{metric_id}")
            if metric["value"] != output["value"]:
                raise UnderwritingError(f"analysis_output_metric_value_mismatch:{metric_id}")
            if metric["governing_receipt_sha256"] != receipt["receipt_sha256"]:
                raise UnderwritingError(f"analysis_output_receipt_mismatch:{metric_id}")
            expected_locator_ids = {
                f"locator-{receipt['analysis_id'].lower()}-{item['artifact_id']}"
                for item in receipt["inputs"]
            }
            if not expected_locator_ids:
                raise UnderwritingError(
                    f"analysis_output_lineage_missing:{receipt['analysis_id']}:{output['name']}"
                )
            if set(metric["source_locator_ids"]) != expected_locator_ids:
                raise UnderwritingError(f"analysis_output_locator_mismatch:{metric_id}")

    pe_engine = case.get("peEngine")
    if pe_engine is not None:
        selected = pe_engine["selected"]
        selected_receipt = selected["receipt_sha256"]
        for index, flow in enumerate(selected["sponsor_cash_flows"], start=1):
            metric_id = (
                f"{case['caseId']}-{selected['scenario_id']}"
                f"-sponsor-cash-flow-{index:02d}"
            )
            metric = metrics.get(metric_id)
            if metric is None:
                raise UnderwritingError(f"pe_sponsor_cash_flow_metric_missing:{metric_id}")
            if (
                Decimal(metric["value"]) != Decimal(flow["amount_cents"])
                or metric["period"] != flow["date"]
                or metric["governing_receipt_sha256"] != selected_receipt
            ):
                raise UnderwritingError(f"pe_sponsor_cash_flow_metric_mismatch:{metric_id}")

    vc_engine = case.get("vcEngine")
    if vc_engine is not None:
        milestone = vc_engine["milestone"]
        milestone_receipt = milestone["receipt_sha256"]
        for index, flow in enumerate(milestone["target_cash_flows"], start=1):
            metric_id = f"{case['caseId']}-MILESTONE-target-cash-flow-{index:02d}"
            metric = metrics.get(metric_id)
            if metric is None:
                raise UnderwritingError(f"vc_target_cash_flow_metric_missing:{metric_id}")
            if (
                Decimal(metric["value"]) != Decimal(flow["amount_cents"])
                or metric["period"] != flow["date"]
                or metric["governing_receipt_sha256"] != milestone_receipt
            ):
                raise UnderwritingError(f"vc_target_cash_flow_metric_mismatch:{metric_id}")
        milestone_metric_values = {
            f"{case['caseId']}-MILESTONE-target-invested": milestone["target_invested_cents"],
            f"{case['caseId']}-MILESTONE-target-proceeds": milestone["target_proceeds_cents"],
            f"{case['caseId']}-MILESTONE-gross-xirr": milestone["gross_xirr"],
            f"{case['caseId']}-MILESTONE-gross-moic": milestone["gross_moic"],
        }
        for metric_id, engine_value in milestone_metric_values.items():
            metric = metrics.get(metric_id)
            if metric is None:
                raise UnderwritingError(f"vc_milestone_metric_missing:{metric_id}")
            if (
                Decimal(metric["value"]) != Decimal(engine_value)
                or metric["governing_receipt_sha256"] != milestone_receipt
            ):
                raise UnderwritingError(f"vc_milestone_metric_mismatch:{metric_id}")
        for event in milestone["financing_events"]:
            metric_id = (
                f"{case['caseId']}-MILESTONE-event-"
                f"{event['event_id']}-new-money"
            )
            metric = metrics.get(metric_id)
            if metric is None:
                raise UnderwritingError(f"vc_financing_event_metric_missing:{metric_id}")
            if (
                Decimal(metric["value"]) != Decimal(event["new_money_cents"])
                or metric["governing_receipt_sha256"] != milestone_receipt
            ):
                raise UnderwritingError(f"vc_financing_event_metric_mismatch:{metric_id}")

    comparison_operators = {
        ">=": lambda observed, threshold: observed >= threshold,
        "<=": lambda observed, threshold: observed <= threshold,
        ">": lambda observed, threshold: observed > threshold,
        "<": lambda observed, threshold: observed < threshold,
        "==": lambda observed, threshold: observed == threshold,
    }
    pairs_by_id: dict[str, dict[str, Any]] = {}
    for pair in case["decision"]["metric_pairs"]:
        if pair["metric_id"] in pairs_by_id:
            raise UnderwritingError("decision_metric_duplicate")
        pairs_by_id[pair["metric_id"]] = pair
        metric = metrics.get(pair["metric_id"])
        if metric is None:
            raise UnderwritingError("decision_metric_orphan")
        if pair["metric"] != metric["label"]:
            raise UnderwritingError("decision_metric_label_mismatch")
        observed = Decimal(pair["observed_value"])
        if observed != Decimal(metric["value"]):
            raise UnderwritingError("decision_metric_value_mismatch")
        threshold = Decimal(pair["threshold_value"])
        compare = comparison_operators.get(pair["operator"])
        if compare is None:
            raise UnderwritingError("decision_metric_operator_invalid")
        expected_status = "CLEARS" if compare(observed, threshold) else "MISSES"
        if pair["status"] != expected_status:
            raise UnderwritingError("decision_metric_status_mismatch")
        unit = metric["unit"]
        threshold_match = re.fullmatch(
            r"(>=|<=|>|<|==)(-?[0-9]+(?:\.[0-9]+)?)(%|x| months)",
            pair["threshold"],
        )
        if threshold_match is None or threshold_match.group(1) != pair["operator"]:
            raise UnderwritingError("decision_metric_threshold_display_mismatch")
        visible_threshold = Decimal(threshold_match.group(2))
        suffix = threshold_match.group(3)
        expected_suffix = {
            "decimal_rate": "%",
            "percent": "%",
            "multiple": "x",
            "modeled_months_funded_minimum": " months",
        }.get(unit)
        if suffix != expected_suffix:
            raise UnderwritingError("decision_metric_threshold_unit_mismatch")
        structured_visible_threshold = (
            visible_threshold / Decimal(100)
            if unit == "decimal_rate"
            else visible_threshold
        )
        if structured_visible_threshold != threshold:
            raise UnderwritingError("decision_metric_threshold_value_mismatch")
        if unit == "decimal_rate":
            expected_display = f"{quantize(observed * 100)}%"
        elif unit == "multiple":
            expected_display = f"{quantize(observed)}x"
        elif unit == "percent":
            expected_display = f"{quantize(observed)}%"
        elif unit == "modeled_months_funded_minimum":
            expected_display = f">={quantize(observed)} modeled months"
        else:
            raise UnderwritingError("decision_metric_unit_unsupported")
        if pair["metric_id"] == "helios-hx-09-probability_below_1x":
            probability = observed / Decimal(100)
            draws = Decimal(case["vcEngine"]["distribution"]["draws"])
            standard_error_pp = (
                probability * (Decimal(1) - probability) / draws
            ).sqrt() * Decimal(100)
            expected_display += f" (MC SE {quantize(standard_error_pp)} pp)"
        if pair["observed"] != expected_display:
            raise UnderwritingError("decision_metric_display_mismatch")

    if case.get("vcEngine"):
        loss_pair = pairs_by_id.get("helios-hx-09-probability_below_1x")
        if not loss_pair:
            raise UnderwritingError("vc_risk_policy_decision_pair_missing")
        expected_loss_threshold_percent = (
            Decimal(case["vcEngine"]["risk_policy"]["maximum_probability_below_one"])
            * Decimal(100)
        )
        if (
            loss_pair["operator"] != "<="
            or Decimal(loss_pair["threshold_value"]) != expected_loss_threshold_percent
        ):
            raise UnderwritingError("vc_risk_policy_decision_pair_mismatch")

    return_hurdles = [
        pair for pair in pairs_by_id.values()
        if pair["designation"] == "BINDING"
        and ("gross-irr" in pair["metric_id"] or "gross-moic" in pair["metric_id"])
    ]
    if return_hurdles and (case.get("peEngine") or case.get("vcEngine")):
        downside = case["peEngine"]["downside"] if case.get("peEngine") else case["vcEngine"]["downside"]
        if all(
            comparison_operators[pair["operator"]](
                Decimal(downside["gross_xirr"] if "gross-irr" in pair["metric_id"] else downside["gross_moic"]),
                Decimal(pair["threshold_value"]),
            )
            for pair in return_hurdles
        ):
            raise UnderwritingError("binding_return_hurdles_never_fail_retained_stress")

    condition_states = case["decision"]["condition_states"]
    if case["decision"]["conditions"] != [item["text"] for item in condition_states]:
        raise UnderwritingError("decision_condition_text_mismatch")
    condition_ids = [item["condition_id"] for item in condition_states]
    if len(condition_ids) != len(set(condition_ids)):
        raise UnderwritingError("decision_condition_duplicate")
    open_conditions = 0
    for condition in condition_states:
        metric_ids = condition["metric_ids"]
        if any(metric_id not in pairs_by_id for metric_id in metric_ids):
            raise UnderwritingError("decision_condition_metric_orphan")
        if condition["designation"] == "INFORMATIONAL":
            if condition["state"] != "INFORMATIONAL":
                raise UnderwritingError("decision_condition_information_designation_mismatch")
            if any(pairs_by_id[metric_id]["designation"] != "INFORMATIONAL" for metric_id in metric_ids):
                raise UnderwritingError("decision_condition_hurdle_designation_mismatch")
            continue
        if any(pairs_by_id[metric_id]["designation"] != "BINDING" for metric_id in metric_ids):
            raise UnderwritingError("decision_condition_hurdle_designation_mismatch")
        if condition["state"] == "CLEARS_QUANTITATIVELY":
            if not metric_ids or any(pairs_by_id[metric_id]["status"] != "CLEARS" for metric_id in metric_ids):
                raise UnderwritingError("decision_condition_false_clear")
        elif condition["state"] == "MISSES_HURDLE":
            if not metric_ids or all(pairs_by_id[metric_id]["status"] == "CLEARS" for metric_id in metric_ids):
                raise UnderwritingError("decision_condition_false_miss")
            open_conditions += 1
        elif condition["state"] == "OPEN_DILIGENCE":
            if metric_ids:
                raise UnderwritingError("decision_diligence_condition_has_metric")
            open_conditions += 1
        else:
            raise UnderwritingError("decision_condition_state_invalid")
    if case["decision"]["open_conditions"] != open_conditions:
        raise UnderwritingError("decision_open_condition_count_mismatch")
    if any(
        condition["designation"] == "BINDING" and condition["state"] == "MISSES_HURDLE"
        for condition in condition_states
    ) and case["decision"]["decision"] != "HOLD":
        raise UnderwritingError("binding_hurdle_miss_requires_hold")

    issue_summary = case["decision"].get("issue_summary")
    if not isinstance(issue_summary, dict) or issue_summary.get("schema_version") != "underwriting.issue-summary/v1":
        raise UnderwritingError("decision_issue_summary_missing")
    issues = issue_summary.get("issues")
    buckets = issue_summary.get("buckets")
    counts = issue_summary.get("counts")
    if not isinstance(issues, list) or not isinstance(buckets, dict) or not isinstance(counts, dict):
        raise UnderwritingError("decision_issue_summary_invalid")
    issue_ids = [item.get("issue_id") for item in issues if isinstance(item, dict)]
    if len(issue_ids) != len(issues) or len(issue_ids) != len(set(issue_ids)):
        raise UnderwritingError("decision_issue_duplicate")
    expected_buckets = {
        "failed_quantitative_hurdles": [item["issue_id"] for item in issues if item["kind"] == "QUANTITATIVE_HURDLE" and item["state"] == "FAILED"],
        "advancement_blockers": [item["issue_id"] for item in issues if item["blocks_advancement"]],
        "pre_ic_requirements": [item["issue_id"] for item in issues if item["stage"] == "PRE_IC"],
        "pre_signing_requirements": [item["issue_id"] for item in issues if item["stage"] == "PRE_SIGNING"],
        "pre_debt_commitment_requirements": [item["issue_id"] for item in issues if item["stage"] == "PRE_DEBT_COMMITMENT"],
        "nonblocking_diligence": [item["issue_id"] for item in issues if not item["blocks_advancement"]],
    }
    if buckets != expected_buckets:
        raise UnderwritingError("decision_issue_bucket_mismatch")
    if counts != {key: len(value) for key, value in expected_buckets.items()}:
        raise UnderwritingError("decision_issue_count_mismatch")
    if any(linked not in condition_ids for item in issues for linked in item["linked_condition_ids"]):
        raise UnderwritingError("decision_issue_condition_orphan")

    mappings_by_analysis: dict[str, dict[str, Any]] = {}
    for mapping in case["evidenceMappings"]:
        mapping_body = dict(mapping)
        expected_mapping_sha256 = mapping_body.pop("mapping_sha256", None)
        if expected_mapping_sha256 != digest(mapping_body):
            raise UnderwritingError("evidence_mapping_digest_mismatch")
        analysis_id = mapping["source_analysis_id"]
        if analysis_id in mappings_by_analysis:
            raise UnderwritingError("evidence_mapping_duplicate")
        if mapping.get("credit_tier") not in {"BASE_CASE", "VALUE_CREATION_BRIDGE", "SCENARIO_ONLY", "ZERO"}:
            raise UnderwritingError("evidence_mapping_credit_tier_invalid")
        mappings_by_analysis[analysis_id] = mapping
    analysis_ids = {item["analysis_id"] for item in case["analyses"]}
    if set(mappings_by_analysis) != analysis_ids:
        raise UnderwritingError("evidence_mapping_coverage_mismatch")
    for issue in issues:
        if issue["evidence_state"] not in {"PRESENT", "PARTIAL", "ABSENT"}:
            raise UnderwritingError("decision_issue_evidence_state_invalid")
        if not issue["analysis_ids"] or not set(issue["analysis_ids"]).issubset(analysis_ids):
            raise UnderwritingError("decision_issue_analysis_orphan")
        if not issue["evidence_metric_ids"] or not set(issue["evidence_metric_ids"]).issubset(metrics):
            raise UnderwritingError("decision_issue_metric_orphan")
        if issue["evidence_state"] == "PRESENT" and not issue["evidence_metric_ids"]:
            raise UnderwritingError("decision_issue_present_without_evidence")
    if case["caseId"] == "atlasgrid" and mappings_by_analysis["AG-08"]["credit_tier"] != "VALUE_CREATION_BRIDGE":
        raise UnderwritingError("ag08_base_case_credit_forbidden")

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
        if output["unit"] != formula["output_unit"]:
            raise UnderwritingError("formula_output_unit_mismatch")
        operation = formula["operation"]
        operand_units = [metrics[item]["unit"] for item in formula["operand_ids"]]
        same_unit_operations = {
            "ADD", "SUBTRACT", "MIN", "MAX", "SUM", "SUM_POSITIVE", "ABS_SUM_NEGATIVE"
        }
        if operation in same_unit_operations:
            units_valid = bool(operand_units) and all(
                unit == output["unit"] for unit in operand_units
            )
        elif operation == "MULTIPLY":
            units_valid = output["unit"] == "cents" and operand_units == ["cents", "multiple"]
        elif operation == "DIVIDE":
            units_valid = (
                output["unit"] == "multiple" and operand_units == ["cents", "cents"]
            ) or (
                output["unit"] == "decimal_rate" and operand_units == ["shares", "shares"]
            )
        elif operation == "DATED_XIRR":
            units_valid = output["unit"] == "decimal_rate" and all(
                unit == "cents" for unit in operand_units
            )
        elif operation.startswith("QUANTILE_P"):
            units_valid = (
                len(operand_units) >= 3
                and operand_units[:2] == ["count", "rank_index"]
                and all(unit == output["unit"] for unit in operand_units[2:])
            )
        elif operation == "PROBABILITY_BELOW_ONE_PERCENT":
            units_valid = output["unit"] == "percent" and all(
                unit == "multiple" for unit in operand_units
            )
        else:
            units_valid = False
        if not units_valid:
            raise UnderwritingError(f"formula_dimensional_mismatch:{formula_id}")
        values = [Decimal(metrics[item]["value"]) for item in formula["operand_ids"]]
        left, right = values[:2]
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
            expected = min(values)
        elif operation == "SUM":
            expected = sum(values)
        elif operation == "SUM_POSITIVE":
            expected = sum(value for value in values if value > 0)
        elif operation == "ABS_SUM_NEGATIVE":
            expected = -sum(value for value in values if value < 0)
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
        elif operation.startswith("QUANTILE_P"):
            probability = {
                "QUANTILE_P10": Decimal("0.10"),
                "QUANTILE_P50": Decimal("0.50"),
                "QUANTILE_P90": Decimal("0.90"),
            }[operation]
            draw_count, observed_index, *path_values = values
            if draw_count != len(path_values) or draw_count < 1:
                raise UnderwritingError(f"formula_quantile_path_count_mismatch:{formula_id}")
            index = int(
                ((draw_count - Decimal(1)) * probability).quantize(
                    Decimal("1"), rounding=ROUND_HALF_EVEN
                )
            )
            if observed_index != index:
                raise UnderwritingError(f"formula_quantile_rank_mismatch:{formula_id}")
            expected = sorted(path_values)[index]
        elif operation == "PROBABILITY_BELOW_ONE_PERCENT":
            if not values:
                raise UnderwritingError(f"formula_probability_operands_empty:{formula_id}")
            expected = Decimal(sum(value < 1 for value in values)) / Decimal(len(values)) * Decimal(100)
        else:
            expected = max(values)
        expected = expected.quantize(
            Decimal(output["quantum"]), rounding=ROUND_HALF_EVEN
        )
        if Decimal(output["value"]) != expected:
            raise UnderwritingError(f"formula_value_mismatch:{formula_id}")

        display = output["display_value"].replace("−", "-")
        raw_value = Decimal(output["value"])
        unit = output["unit"]
        observed_display: Decimal | None = None
        tolerance = Decimal(0)
        if unit == "cents":
            money_match = re.fullmatch(r"(-)?\$([0-9]+(?:\.[0-9]+)?)M", display)
            if display == "$0":
                observed_display = Decimal(0)
                tolerance = Decimal("0.5")
            elif display == "<$1; immaterial" and abs(raw_value) < Decimal(100):
                observed_display = raw_value
            elif display in {"<$0.1M", "-<$0.1M"} and abs(raw_value) < Decimal(10_000_000):
                observed_display = raw_value
            elif money_match:
                decimals = len((money_match.group(2).split(".") + [""])[1])
                observed_display = Decimal(money_match.group(2)) * Decimal(100_000_000)
                if money_match.group(1):
                    observed_display = -observed_display
                tolerance = Decimal(100_000_000) / (Decimal(2) * (Decimal(10) ** decimals))
            else:
                raise UnderwritingError(f"metric_display_invalid:{output['metric_id']}")
        elif unit in {"decimal_rate", "percent"}:
            percent_match = re.fullmatch(r"(-?[0-9]+(?:\.[0-9]+)?)%", display)
            if percent_match is None:
                raise UnderwritingError(f"metric_display_invalid:{output['metric_id']}")
            decimals = len((percent_match.group(1).split(".") + [""])[1])
            divisor = Decimal(100) if unit == "decimal_rate" else Decimal(1)
            observed_display = Decimal(percent_match.group(1)) / divisor
            tolerance = Decimal(1) / (Decimal(2) * (Decimal(10) ** decimals) * divisor)
        elif unit in {"multiple", "turns"}:
            multiple_match = re.fullmatch(r"(-?[0-9]+(?:\.[0-9]+)?)x", display)
            if multiple_match is None:
                raise UnderwritingError(f"metric_display_invalid:{output['metric_id']}")
            decimals = len((multiple_match.group(1).split(".") + [""])[1])
            observed_display = Decimal(multiple_match.group(1))
            tolerance = Decimal(1) / (Decimal(2) * (Decimal(10) ** decimals))
        if observed_display is not None and abs(observed_display - raw_value) > tolerance:
            raise UnderwritingError(f"metric_display_value_mismatch:{output['metric_id']}")

    # Formula self-consistency alone is insufficient: a coherent attacker can
    # alter an engine-linked registry leaf, recompute every downstream formula,
    # and rebind all JSON digests while leaving the authoritative engine result
    # unchanged. Rebuild the complete public calculation contract from the
    # already-validated engine, analysis, summary, lineage, and locator objects
    # and require exact equality. This binds every scenario, sensitivity cell,
    # retained distribution path, and value-creation bridge value—not only the
    # selected headline outputs—to its governing engine object. It intentionally
    # follows the narrower checks above so they retain their precise diagnostics.
    for summary in case["summaryMetrics"]:
        metric = metrics.get(summary["metric_id"])
        if metric is None or metric["display_value"] != summary["value"]:
            raise UnderwritingError(f"summary_metric_display_mismatch:{summary['metric_id']}")
    distribution_prefix = (
        f"{case['caseId']}-distribution-"
        if case.get("peEngine") is not None
        else "helios-distribution-moic-"
    )
    for index, visible_value in enumerate(case["returnsDistribution"]["moic"]):
        metric = metrics.get(f"{distribution_prefix}{index}")
        if metric is None or Decimal(metric["display_value"].removesuffix("x")) != Decimal(str(visible_value)):
            raise UnderwritingError("returns_distribution_metric_mismatch")

    render_ids = case["renderManifest"]["metric_ids"]
    if not set(render_ids).issubset(metrics):
        raise UnderwritingError("render_manifest_metric_orphan")
    investment_ids = case["renderManifest"]["investment_metric_ids"]
    if not set(investment_ids).issubset(render_ids):
        raise UnderwritingError("investment_metric_not_rendered")
    if any(
        metrics[item]["formula_id"] is None
        or not metrics[item]["operand_ids"]
        or metrics[item]["formula_id"] not in formulas
        for item in investment_ids
    ):
        raise UnderwritingError("investment_metric_calculation_open")
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

    _validate_metric_semantic_binding(case)


def _validate_editorial_contract(case: dict[str, Any]) -> None:
    request_ids = [item["request_id"] for item in case["thesis"]["requests"]]
    if len(request_ids) != len(set(request_ids)):
        raise UnderwritingError("diligence_request_duplicate")
    chart_ids = [item["chart_id"] for item in case["chartRegistry"]]
    if len(chart_ids) != len(set(chart_ids)):
        raise UnderwritingError("chart_registry_duplicate")
    initiatives = case["valueCreation"]
    if not 3 <= len(initiatives) <= 5:
        raise UnderwritingError("value_creation_priority_count_invalid")
    priorities = [item["priority"] for item in initiatives]
    if priorities != list(range(1, len(initiatives) + 1)):
        raise UnderwritingError("value_creation_priorities_invalid")
    lineage_ids = {item["node_id"] for item in case["lineage"]}
    for initiative in initiatives:
        if not set(initiative["lineage"]).issubset(lineage_ids):
            raise UnderwritingError("value_creation_lineage_orphan")
    screened_levers = [item["lever"] for item in case["screenedOutLevers"]]
    if len(screened_levers) != len(set(screened_levers)):
        raise UnderwritingError("screened_out_lever_duplicate")


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
        _validate_editorial_contract(case)
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
    if "dealContext" in case:
        context = dict(case["dealContext"])
        context_digest = context.pop("context_sha256", None)
        if context_digest != digest(context):
            raise UnderwritingError("deal_context_digest_mismatch")
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
