from decimal import Decimal

import pytest

from underwriting_lab.contracts import UnderwritingError
from underwriting_lab.contracts import digest
from underwriting_lab.specs import CASE_ANALYSES, analysis_specs
from underwriting_lab.v2_core import (
    DecisionState,
    FormulaRegistry,
    FormulaSpec,
    MetricState,
    TypedMetric,
    derive_decision_state,
    propagate_staleness,
)


def test_typed_metric_requires_complete_provenance_and_currency() -> None:
    metric = TypedMetric(
        metric_id="ag.normalized_ebitda",
        value=Decimal("2012345000"),
        unit="currency",
        currency="USD",
        period="LTM_2026_08",
        classification="ACCOUNTING_IDENTITY",
        source_ids=("qoe-bridge",),
        downstream_ids=("ag.sponsor_equity",),
    )
    assert metric.as_dict()["value"] == "2012345000"
    assert metric.state is MetricState.CURRENT
    with pytest.raises(UnderwritingError, match="typed_metric_currency_required"):
        TypedMetric(
            metric_id="bad",
            value=Decimal("1"),
            unit="currency",
            period="LTM",
            classification="ACCOUNTING_IDENTITY",
            source_ids=("source",),
        )


def test_formula_registry_is_exact_and_rejects_iterative_operations() -> None:
    registry = FormulaRegistry(
        [FormulaSpec("equity", "SUBTRACT", ("enterprise_value", "net_debt"), "currency")]
    )
    assert registry.evaluate(
        "equity", {"enterprise_value": Decimal("24000"), "net_debt": Decimal("8000")}
    ) == Decimal("16000")
    assert len(registry.digest()) == 64
    with pytest.raises(UnderwritingError, match="formula_operation_invalid"):
        FormulaSpec("irr", "XIRR", ("cash_flows", "dates"), "percent")


@pytest.mark.parametrize(
    ("diagnostics", "stale", "conditions", "signature", "expected"),
    [
        ([{"role": "DECISION_CRITICAL", "status": "FAIL"}], [], 0, "PENDING_FOUNDER_SIGNATURE", DecisionState.BLOCKED_EVIDENCE),
        ([], ["ag.return"], 0, "PENDING_FOUNDER_SIGNATURE", DecisionState.BLOCKED_EVIDENCE),
        ([{"role": "IDENTIFICATION_BOUNDARY", "status": "BLOCKED"}], [], 2, "PENDING_FOUNDER_SIGNATURE", DecisionState.HOLD_OPEN_CONDITIONS),
        ([{"role": "IDENTIFICATION_BOUNDARY", "status": "BLOCKED"}], [], 0, "PENDING_FOUNDER_SIGNATURE", DecisionState.READY_FOR_ADJUDICATION),
        ([], [], 0, "SIGNED", DecisionState.SEALED),
    ],
)
def test_decision_state_machine_distinguishes_abstention_and_authority(
    diagnostics: list[dict[str, str]],
    stale: list[str],
    conditions: int,
    signature: str,
    expected: DecisionState,
) -> None:
    assert derive_decision_state(
        diagnostics=diagnostics,
        stale_metric_ids=stale,
        open_conditions=conditions,
        signature_status=signature,
    ) is expected


def test_staleness_propagates_transitively_without_touching_other_branches() -> None:
    edges = [
        ("source.arr", "estimate.nrr"),
        ("estimate.nrr", "scenario.base"),
        ("scenario.base", "decision.reprice"),
        ("source.qoe", "estimate.ebitda"),
    ]
    assert propagate_staleness(changed_ids=["source.arr"], edges=edges) == {
        "source.arr",
        "estimate.nrr",
        "scenario.base",
        "decision.reprice",
    }


def test_all_twenty_analysis_specs_are_structured_and_hash_bound() -> None:
    specs = analysis_specs("atlasgrid") + analysis_specs("helios")
    assert len(specs) == sum(len(ids) for ids in CASE_ANALYSES.values()) == 20
    assert {item["analysis_id"] for item in specs} == {
        analysis_id for ids in CASE_ANALYSES.values() for analysis_id in ids
    }
    required = {
        "outcome",
        "treatment_or_exposure",
        "population",
        "period",
        "estimand",
        "unit",
        "assignment_or_design",
        "uncertainty_method",
        "required_diagnostics",
        "permitted_use",
    }
    for spec in specs:
        assert spec["schema_version"] == "underwriting.analysis-spec/v2"
        assert set(spec["design"]) == required
        assert "Precommitted output contract" not in spec["design"]["estimand"]
        body = dict(spec)
        expected = body.pop("spec_sha256")
        assert expected == digest(body)
        body["design"] = {**body["design"], "period": body["design"]["period"] + " mutated"}
        assert digest(body) != expected
