from __future__ import annotations

import json
from decimal import Decimal
from importlib import resources
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from underwriting_lab.analysis import analyze_room
from underwriting_lab.contracts import UnderwritingError, analysis_receipt, digest, validate_workbench_case
from underwriting_lab.generator import generate_room
from underwriting_lab.verification import RECOVERY_SEEDS


def _json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _schema(name: str) -> dict:
    target = resources.files("underwriting_lab.schemas").joinpath(name)
    return json.loads(target.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def generated(tmp_path_factory: pytest.TempPathFactory) -> dict[str, tuple[Path, dict]]:
    root = tmp_path_factory.mktemp("underwriting")
    result: dict[str, tuple[Path, dict]] = {}
    for case_id, seed in (("atlasgrid", 20260828), ("helios", 20260829)):
        manifest = generate_room(case_id, seed, root / case_id)
        analysis_path = analyze_room(manifest, root / case_id / "analysis.json")
        result[case_id] = (manifest, _json(analysis_path))
    return result


def test_underwriting_schemas_are_valid() -> None:
    for name in (
        "dataroom-manifest.schema.json",
        "analysis-receipt.schema.json",
        "decision-record.schema.json",
        "scenario-book.schema.json",
        "thesis-graph.schema.json",
    ):
        Draft202012Validator.check_schema(_schema(name))


def test_generated_manifests_and_outputs_validate(generated: dict[str, tuple[Path, dict]]) -> None:
    manifest_validator = Draft202012Validator(_schema("dataroom-manifest.schema.json"), format_checker=Draft202012Validator.FORMAT_CHECKER)
    receipt_validator = Draft202012Validator(_schema("analysis-receipt.schema.json"), format_checker=Draft202012Validator.FORMAT_CHECKER)
    decision_validator = Draft202012Validator(_schema("decision-record.schema.json"))
    scenario_validator = Draft202012Validator(_schema("scenario-book.schema.json"))
    graph_validator = Draft202012Validator(_schema("thesis-graph.schema.json"))
    for manifest_path, analysis in generated.values():
        manifest_validator.validate(_json(manifest_path))
        decision_validator.validate(analysis["decision"])
        scenario_validator.validate(analysis["scenarioBook"])
        graph_validator.validate(analysis["thesisGraph"])
        assert analysis["investmentAdjudication"] == "PENDING_HUMAN"
        assert analysis["workflowDisposition"] == "HOLD"
        context = dict(analysis["dealContext"])
        assert context.pop("context_sha256") == digest(context)
        assert len(context["competition"]) >= 3
        states = analysis["decision"]["condition_states"]
        assert analysis["decision"]["conditions"] == [item["text"] for item in states]
        assert analysis["decision"]["open_conditions"] == sum(
            item["designation"] == "BINDING"
            and item["state"] != "CLEARS_QUANTITATIVELY"
            for item in states
        )
        for receipt in analysis["analyses"]:
            receipt_validator.validate(receipt)


def test_same_seed_is_byte_deterministic_and_different_seed_changes_digest(tmp_path: Path) -> None:
    first = generate_room("helios", 77, tmp_path / "first")
    second = generate_room("helios", 77, tmp_path / "second")
    different = generate_room("helios", 78, tmp_path / "different")
    first_root, second_root = first.parent, second.parent
    first_files = sorted(path.relative_to(first_root) for path in first_root.rglob("*") if path.is_file())
    second_files = sorted(path.relative_to(second_root) for path in second_root.rglob("*") if path.is_file())
    assert first_files == second_files
    assert all((first_root / path).read_bytes() == (second_root / path).read_bytes() for path in first_files)
    assert _json(first)["manifest_sha256"] != _json(different)["manifest_sha256"]


def test_analysis_repeat_is_byte_identical(generated: dict[str, tuple[Path, dict]], tmp_path: Path) -> None:
    for case_id, (manifest, _) in generated.items():
        first = analyze_room(manifest, tmp_path / f"{case_id}-first.json")
        second = analyze_room(manifest, tmp_path / f"{case_id}-second.json")
        assert first.read_bytes() == second.read_bytes()


def test_truth_is_outside_runtime_case_and_not_serialized(generated: dict[str, tuple[Path, dict]]) -> None:
    for manifest_path, analysis in generated.values():
        assert "verification" not in manifest_path.read_text(encoding="utf-8")
        assert "ground_truth" not in manifest_path.read_text(encoding="utf-8")
        assert "master_seed" not in json.dumps(analysis, sort_keys=True)
        assert (manifest_path.parents[1] / "verification" / "truth" / "ground_truth.json").is_file()


def test_atlasgrid_contract_gates(generated: dict[str, tuple[Path, dict]]) -> None:
    _, case = generated["atlasgrid"]
    assert case["decision"]["decision"] == "REPRICE"
    metrics = {item["metric_id"]: item for item in case["summaryMetrics"]}
    assert float(metrics["ag-return"]["value"].rstrip("%")) >= 22
    assert float(metrics["ag-return"]["detail"].split("x")[0]) >= 2
    receipts = {item["analysis_id"]: item for item in case["analyses"]}
    assert receipts["AG-01"]["diagnostics"][0]["status"] == "PASS"
    assert receipts["AG-02"]["diagnostics"][0]["status"] == "PASS"
    assert receipts["AG-03"]["diagnostics"][0]["status"] == "PASS"
    assert receipts["AG-04"]["diagnostics"][0]["status"] == "PASS"
    assert receipts["AG-05"]["diagnostics"][1]["status"] == "PASS"
    assert receipts["AG-06"]["classification"] == "PREDICTIVE_ASSOCIATION"
    ag06_diagnostics = {item["name"]: item for item in receipts["AG-06"]["diagnostics"]}
    assert "slope_first_stage_covariance" in ag06_diagnostics
    assert "zero investment model credit" in ag06_diagnostics["confounding_audit"]["value"]
    ag07_diagnostics = {item["name"]: item for item in receipts["AG-07"]["diagnostics"]}
    assert ag07_diagnostics["risk_score_smd"]["status"] == "PASS"
    ag08_diagnostics = {item["name"]: item for item in receipts["AG-08"]["diagnostics"]}
    assert ag08_diagnostics["fake_date_placebo_hours"]["status"] == "PASS"
    assert ag08_diagnostics["pretrend_slope_gap"]["status"] == "PASS"
    assert receipts["AG-09"]["state"] == "ABSTAIN"
    assert receipts["AG-10"]["diagnostics"][0]["status"] == "PASS"
    assert Decimal(case["peEngine"]["distribution"]["probability_covenant_breach"]) > 0


def test_atlasgrid_displayed_returns_bind_to_cash_flow_engine(generated: dict[str, tuple[Path, dict]]) -> None:
    _, case = generated["atlasgrid"]
    engine = case["peEngine"]
    receipt = {item["name"]: item["value"] for item in next(
        item for item in case["analyses"] if item["analysis_id"] == "AG-10"
    )["outputs"]}
    for scenario in ("ask", "selected", "downside"):
        body = dict(engine[scenario])
        expected = body.pop("receipt_sha256")
        assert expected == digest(body)
        assert body["sources_and_uses"]["total_sources_cents"] == body["sources_and_uses"]["total_uses_cents"]
        assert body["debt_schedule"]["ending_debt_cents"] == (
            body["debt_schedule"]["months"][-1]["ending_term_cents"]
            + body["debt_schedule"]["months"][-1]["ending_revolver_cents"]
        )
    assert Decimal(receipt["ask_irr"]) == (Decimal(engine["ask"]["gross_xirr"]) * 100).quantize(Decimal("0.01"))
    assert Decimal(receipt["reprice_irr"]) == (Decimal(engine["selected"]["gross_xirr"]) * 100).quantize(Decimal("0.01"))
    assert Decimal(receipt["downside_irr"]) == (Decimal(engine["downside"]["gross_xirr"]) * 100).quantize(Decimal("0.01"))
    assert Decimal(engine["ask"]["gross_xirr"]) < Decimal("0.22")
    assert Decimal(engine["selected"]["gross_xirr"]) >= Decimal("0.22")
    assert Decimal(engine["selected"]["gross_moic"]) >= Decimal("2.00")
    assert Decimal(engine["downside"]["gross_xirr"]) >= Decimal("0.05")
    assert Decimal(engine["downside"]["gross_moic"]) >= Decimal("1.25")
    bridge = dict(case["valueCreationBridge"])
    bridge_digest = bridge.pop("receipt_sha256")
    assert bridge_digest == digest(bridge)
    assert bridge["combined_exit_equity_delta_cents"] == (
        bridge["sum_standalone_exit_equity_delta_cents"]
        + bridge["interaction_residual_cents"]
    )
    assert len(bridge["standalone"]) == len(case["valueCreation"]) == 3
    assert all(item["implementation_cost_cents"] >= 0 for item in bridge["standalone"])
    assert all(item["credit_classification"] for item in bridge["standalone"])
    ag09_lever = next(item for item in bridge["standalone"] if "AG-09" in item["source_analysis_ids"])
    assert ag09_lever["credit_classification"] == "HUMAN_JUDGMENT"
    assert all("no standalone value" not in item["value"].lower() for item in case["valueCreation"])
    for initiative in case["valueCreation"]:
        if "HUMAN_JUDGMENT" in initiative["credit_classification"]:
            assert "illustrative and unverified" in initiative["value"]
            assert "–" in initiative["value"]

    mappings = {item["mapping_id"]: dict(item) for item in case["evidenceMappings"]}
    assert len(mappings) == 11
    for mapping in mappings.values():
        expected_mapping_digest = mapping.pop("mapping_sha256")
        assert expected_mapping_digest == digest(mapping)
    assert mappings["ag-pricing-rct-to-renewal-credit"]["model_credit"].startswith("0 from price")
    assert mappings["ag-realized-price-association-zero-credit"]["model_credit"] == "0"
    assert all(
        "AG-06" not in lever["source_analysis_ids"]
        for lever in case["valueCreationBridge"]["standalone"]
    )
    assert mappings["ag-support-did-to-retention-lever"]["credit_classification"] == "CAUSAL_SYNTHETIC_ONLY"
    assert mappings["ag-support-did-to-retention-lever"]["credit_tier"] == "VALUE_CREATION_BRIDGE"
    support = next(item for item in case["valueCreation"] if item["initiative"] == "Support automation")
    assert "margin-only range" in support["value"]

    promoted = json.loads(json.dumps(case))
    ag08 = next(item for item in promoted["evidenceMappings"] if item["source_analysis_id"] == "AG-08")
    ag08["credit_tier"] = "BASE_CASE"
    ag08_body = dict(ag08)
    ag08_body.pop("mapping_sha256")
    ag08["mapping_sha256"] = digest(ag08_body)
    promoted_body = dict(promoted)
    promoted_body.pop("analysis_sha256")
    promoted["analysis_sha256"] = digest(promoted_body)
    with pytest.raises(UnderwritingError, match="ag08_base_case_credit_forbidden"):
        validate_workbench_case(promoted)


def test_helios_contract_gates(generated: dict[str, tuple[Path, dict]]) -> None:
    _, case = generated["helios"]
    assert case["decision"]["decision"] == "HOLD"
    assert case["decision"]["issue_summary"]["counts"] == {
        "failed_quantitative_hurdles": 1,
        "advancement_blockers": 6,
        "pre_ic_requirements": 4,
        "pre_signing_requirements": 2,
        "pre_debt_commitment_requirements": 0,
        "nonblocking_diligence": 0,
    }
    receipts = {item["analysis_id"]: item for item in case["analyses"]}
    assert receipts["HX-01"]["diagnostics"][0]["status"] == "PASS"
    assert receipts["HX-02"]["diagnostics"][0]["status"] == "PASS"
    assert receipts["HX-03"]["diagnostics"][1]["status"] == "PASS"
    assert {item["name"] for item in receipts["HX-03"]["outputs"]} >= {"cac", "cac_payback"}
    hx04_outputs = {item["name"]: item for item in receipts["HX-04"]["outputs"]}
    assert int(hx04_outputs["inflated_opportunities"]["value"]) > 0
    assert any(item["status"] == "ABSTAIN" for item in receipts["HX-05"]["diagnostics"])
    hx06_diagnostics = {item["name"]: item for item in receipts["HX-06"]["diagnostics"]}
    assert hx06_diagnostics["baseline_cost_smd"]["status"] == "PASS"
    assert hx06_diagnostics["assignment_mechanism"]["value"] == "RESTRICTED_SEEDED_PERMUTATION_60_OF_120"
    assert 1 <= int(hx06_diagnostics["assignment_proposal"]["value"]) <= 1_000
    assert hx06_diagnostics["assignment_acceptance_uses_outcomes"]["status"] == "PASS"
    assert hx06_diagnostics["treatment_count"]["value"] == "60"
    assert hx06_diagnostics["control_count"]["value"] == "60"
    assert receipts["HX-07"]["state"] == "ABSTAIN"
    assert receipts["HX-08"]["diagnostics"][0]["status"] == "PASS"
    hx09_diagnostics = {item["name"]: item for item in receipts["HX-09"]["diagnostics"]}
    assert hx09_diagnostics["ordered_xirr_quantiles"]["status"] == "PASS"
    assert hx09_diagnostics["operating_exit_bridge"]["status"] == "PASS"
    assert Decimal(hx09_diagnostics["loss_probability_monte_carlo_se_pp"]["value"]) >= 0
    bridges = case["vcEngine"]["operating_exit_bridges"]
    assert set(bridges) == {"base", "milestone", "downside", "financing_shortfall"}
    for key, bridge in bridges.items():
        terminal = (
            Decimal(bridge["observed_ltm_revenue_cents"])
            * (Decimal(1) + Decimal(bridge["annual_revenue_growth"])) ** int(bridge["years"])
        ).quantize(Decimal("1"))
        enterprise = (terminal * Decimal(bridge["exit_revenue_multiple"])).quantize(Decimal("1"))
        assert int(terminal) == bridge["terminal_revenue_cents"]
        assert int(enterprise) == bridge["exit_enterprise_value_cents"]
        assert bridge["exit_equity_value_cents"] == enterprise - bridge["net_debt_cents"]
        assert bridge["net_debt_cents"] == -bridge["cash_at_exit_cents"]
        assert bridge["cash_at_exit_cents"] == case["vcEngine"][key]["cash_by_month"][-1]["ending_cash_cents"]
        assert case["vcEngine"][key]["waterfall"]["exit_value_cents"] == bridge["exit_equity_value_cents"]
    pairs = {item["metric"]: item for item in case["decision"]["metric_pairs"]}
    assert pairs["Milestone · Series C gross XIRR"]["status"] == "CLEARS"
    assert pairs["Series C gross MOIC"]["status"] == "CLEARS"
    assert pairs["Selected catastrophe prior"]["status"] == "MISSES"
    assert pairs["Selected catastrophe prior"]["designation"] == "BINDING"
    assert pairs["Selected catastrophe prior"]["metric_id"] == "helios-selected-catastrophe-prior"
    probability = Decimal(case["vcEngine"]["distribution"]["probability_below_one"])
    priors = case["vcEngine"]["distribution"]["priors"]
    prior_metric = next(
        item
        for item in case["metricRegistry"]
        if item["metric_id"] == "helios-selected-catastrophe-prior"
    )
    replay_metric = next(
        item
        for item in case["metricRegistry"]
        if item["metric_id"] == "helios-hx-09-probability_below_1x"
    )
    assert prior_metric["value"] == "20.00"
    assert prior_metric["assumption_ids"] == [
        "vc-distribution-priors.catastrophe_probability"
    ]
    assert prior_metric["source_locator_ids"] == []
    assert replay_metric["formula_id"] == "vc-formula-distribution-probability-below-one"
    assert replay_metric["label"] == "Probability Below 1X"
    assert Decimal(priors["loss_probability_band_low"]) <= probability <= Decimal(priors["loss_probability_band_high"])
    assert pairs["Post-close runway"]["observed"].startswith(">=60")
    package_policy = case["vcEngine"]["risk_policy"]
    assert package_policy["classification"] == "ILLUSTRATIVE_ANALYST_POLICY_NOT_FIRM_POLICY"
    assert package_policy["approval_status"] == "UNREVIEWED"
    assert package_policy["owner"] == "Synthetic package author"
    desk_policy = case["vcEngine"]["desk_policy"]
    assert desk_policy["classification"] == "DESK_OWNED_DRAFT_POLICY_OUTSIDE_DATA_ROOM"
    assert desk_policy["status"] == "DRAFT"
    assert Decimal(pairs["Selected catastrophe prior"]["threshold_value"]) == Decimal(desk_policy["thresholds"]["maximum_probability_below_one"]) * 100
    assert Decimal(pairs["Ordinary-cohort NRR"]["threshold_value"]) == Decimal(desk_policy["thresholds"]["ordinary_cohort_nrr"]) * 100
    assert Decimal(pairs["Milestone · Series C gross XIRR"]["threshold_value"]) == Decimal(desk_policy["thresholds"]["gross_xirr"])
    assert Decimal(package_policy["operating_hurdles"]["ordinary_cohort_nrr"]) != Decimal(desk_policy["thresholds"]["ordinary_cohort_nrr"])
    assert Decimal(package_policy["return_hurdles"]["gross_xirr"]) != Decimal(desk_policy["thresholds"]["gross_xirr"])
    risk_book = case["vcEngine"]["risk_sensitivity"]
    assert len(risk_book["cells"]) == 6
    canonical = next(item for item in risk_book["cells"] if item["is_canonical"])
    assert canonical["cell_id"] == risk_book["canonical_cell_id"]
    assert canonical["probability_below_one"] == case["vcEngine"]["distribution"]["probability_below_one"]
    assert canonical["distribution_receipt_sha256"] == case["vcEngine"]["distribution"]["receipt_sha256"]
    assert all(item["analytical_posture"] == "HOLD" for item in risk_book["cells"])
    assert any(item["canonical_policy_status"] == "CLEARS" for item in risk_book["cells"])


def test_every_headline_metric_has_valid_lineage(generated: dict[str, tuple[Path, dict]]) -> None:
    for _, case in generated.values():
        lineage_ids = {item["node_id"] for item in case["lineage"]}
        assert len(lineage_ids) == len(case["lineage"])
        for metric in case["summaryMetrics"]:
            assert metric["lineage"]
            assert set(metric["lineage"]).issubset(lineage_ids)


def test_decision_and_receipt_digests_are_bound(generated: dict[str, tuple[Path, dict]]) -> None:
    for _, case in generated.values():
        decision = dict(case["decision"])
        expected = decision.pop("decision_sha256")
        assert expected == digest(decision)
        for source in case["analyses"]:
            receipt = dict(source)
            expected = receipt.pop("receipt_sha256")
            assert expected == digest(receipt)
            manifest = _json(generated[case["caseId"]][0])
            spec = next(item for item in manifest["analysis_specs"] if item["analysis_id"] == source["analysis_id"])
            assert source["spec_sha256"] == spec["spec_sha256"]
        scenario_book = dict(case["scenarioBook"])
        expected = scenario_book.pop("scenario_sha256")
        assert expected == digest(scenario_book)
        thesis_graph = dict(case["thesisGraph"])
        expected = thesis_graph.pop("graph_sha256")
        assert expected == digest(thesis_graph)


def test_workbench_compiler_contract_accepts_valid_cases(generated: dict[str, tuple[Path, dict]]) -> None:
    for _, case in generated.values():
        validate_workbench_case(case)


def test_workbench_compiler_rejects_tampered_top_level_value(generated: dict[str, tuple[Path, dict]]) -> None:
    case = json.loads(json.dumps(generated["atlasgrid"][1]))
    case["summaryMetrics"][0]["value"] = "99.99%"
    with pytest.raises(UnderwritingError, match="analysis_digest_mismatch"):
        validate_workbench_case(case)


def test_workbench_compiler_rejects_nested_tamper_even_with_rebound_outer_digest(generated: dict[str, tuple[Path, dict]]) -> None:
    case = json.loads(json.dumps(generated["helios"][1]))
    case["analyses"][0]["outputs"][0]["value"] = "999999"
    body = dict(case)
    body.pop("analysis_sha256")
    case["analysis_sha256"] = digest(body)
    with pytest.raises(UnderwritingError, match="analysis_receipt_digest_mismatch"):
        validate_workbench_case(case)


def test_workbench_compiler_rejects_orphan_lineage(generated: dict[str, tuple[Path, dict]]) -> None:
    case = json.loads(json.dumps(generated["atlasgrid"][1]))
    case["lineage"][0]["output_names"] = ["not_an_output"]
    body = dict(case)
    body.pop("analysis_sha256")
    case["analysis_sha256"] = digest(body)
    with pytest.raises(UnderwritingError, match="lineage_operand_unbound"):
        validate_workbench_case(case)


def test_scenario_quantiles_and_case_specific_irr_shape(generated: dict[str, tuple[Path, dict]]) -> None:
    for case_id, (_, case) in generated.items():
        moic = [float(value) for value in case["scenarioBook"]["distribution"]["moic"]]
        assert moic == sorted(moic)
        irr = case["scenarioBook"]["distribution"]["irr"]
        assert len(irr) == 3


def test_helios_scenarios_are_event_based_and_receipt_distinct(
    generated: dict[str, tuple[Path, dict]],
) -> None:
    _, case = generated["helios"]
    engine = case["vcEngine"]
    results = [
        engine["base"],
        engine["milestone"],
        engine["downside"],
        engine["financing_shortfall"],
    ]
    assert len({item["engine_inputs_sha256"] for item in results}) == 4
    assert len({item["receipt_sha256"] for item in results}) == 4
    assert all(item["gross_xirr"] != "n/a" for item in results)
    assert all(len(item["cash_by_month"]) == 60 for item in results)
    assert all(item["pool_exit_treatment"] == "FULLY_GRANTED_COMMON" for item in results)
    tampered = json.loads(json.dumps(case))
    tampered_result = tampered["vcEngine"]["milestone"]
    tampered_result["pool_exit_treatment"] = "UNISSUED_CANCELLED"
    tampered_body = dict(tampered_result)
    tampered_body.pop("receipt_sha256")
    tampered_result["receipt_sha256"] = digest(tampered_body)
    with pytest.raises(UnderwritingError, match="vc_primary_pool_exit_treatment_invalid"):
        validate_workbench_case(tampered)
    assert len(case["renderManifest"]["formula_sample_metric_ids"]) == 10
    milestone_event = next(
        item
        for item in engine["milestone"]["financing_events"]
        if item["event_type"] == "MILESTONE"
    )
    assert milestone_event["status"] == "FUNDED"
    base_event = next(
        item
        for item in engine["base"]["financing_events"]
        if item["event_type"] == "MILESTONE"
    )
    assert base_event["status"] == "NOT_FUNDED"
    bridge = next(
        item
        for item in engine["financing_shortfall"]["financing_events"]
        if item["event_type"] == "SHORTFALL"
    )
    assert bridge["actual_month"] == engine["financing_shortfall"][
        "first_cash_exhaustion_month_without_contingent_financing"
    ]


def test_classification_rules_fail_closed() -> None:
    with pytest.raises(UnderwritingError, match="predictive_uncertainty_required"):
        analysis_receipt(
            analysis_id="ZZ-01",
            question="Does an association exist in the frozen sample?",
            classification="PREDICTIVE_ASSOCIATION",
            method="OLS",
            population="synthetic sample",
            inputs=[],
            outputs=[],
            assumptions=[],
            diagnostics=[],
        )


def test_recovery_seed_plan_is_precommitted_and_disjoint() -> None:
    atlasgrid = RECOVERY_SEEDS["atlasgrid"]
    helios = RECOVERY_SEEDS["helios"]
    assert len(atlasgrid) == len(set(atlasgrid)) == 3
    assert len(helios) == len(set(helios)) == 3
    assert set(atlasgrid).isdisjoint(helios)


def test_atlasgrid_recovery_seed_keeps_combined_bid_boundary_feasible(tmp_path: Path) -> None:
    seed = RECOVERY_SEEDS["atlasgrid"][1]
    manifest = generate_room("atlasgrid", seed, tmp_path / "atlasgrid-recovery")
    case = _json(analyze_room(manifest, tmp_path / "atlasgrid-recovery.json"))
    receipt = next(item for item in case["analyses"] if item["analysis_id"] == "AG-10")
    diagnostic = next(
        item for item in receipt["diagnostics"]
        if item["name"] == "maximum_bid_downside_floor"
    )
    assert diagnostic["status"] == "PASS"
    assert case["peEngine"]["maximum_bid_cents"] >= 15_000_000_000
    # Recovery rooms remain useful for estimator and bid-boundary diagnostics,
    # but they cannot silently become publishable packets when a precommitted
    # scenario-prior band misses. The packet/workbench validator is the
    # fail-closed boundary.
    with pytest.raises(
        UnderwritingError, match="pe_distribution_probability_outside_prior_band"
    ):
        validate_workbench_case(case)


def test_committed_recovery_ledger_is_bound_and_passes() -> None:
    ledger = _json(Path(__file__).parents[1] / "verification" / "underwriting-recovery.json")
    body = dict(ledger)
    expected = body.pop("ledger_sha256")
    assert expected == digest(body)
    assert ledger["summary"] == {
        "checks": 45,
        "failed": 0,
        "passed": 45,
        "runs": 6,
        "state_counts": {
            "ABSTENTION_CONFIRMED": 9,
            "ESTIMATED": 12,
            "FAILED_RECOVERY": 0,
            "INTERVAL_CONTAINS_TRUTH": 24,
        },
        "status": "PASS",
    }


def test_causal_classification_requires_assignment_mechanism() -> None:
    with pytest.raises(UnderwritingError, match="causal_assignment_required"):
        analysis_receipt(
            analysis_id="ZZ-02",
            question="What is the causal synthetic treatment effect?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="RCT",
            population="synthetic sample",
            inputs=[],
            outputs=[],
            assumptions=[],
            diagnostics=[{"name": "confidence_interval", "value": "[0,1]", "status": "PASS"}],
        )
