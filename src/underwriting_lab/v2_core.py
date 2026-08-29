from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, DivisionByZero, InvalidOperation
from enum import StrEnum
from typing import Any, Iterable, Mapping, Sequence

from .contracts import CLASSIFICATIONS, UnderwritingError, digest


class DiagnosticRole(StrEnum):
    GENERATOR_INVARIANT = "GENERATOR_INVARIANT"
    IDENTIFICATION_BOUNDARY = "IDENTIFICATION_BOUNDARY"
    DECISION_CRITICAL = "DECISION_CRITICAL"


class DecisionState(StrEnum):
    BLOCKED_EVIDENCE = "BLOCKED_EVIDENCE"
    HOLD_OPEN_CONDITIONS = "HOLD_OPEN_CONDITIONS"
    READY_FOR_ADJUDICATION = "READY_FOR_ADJUDICATION"
    SEALED = "SEALED"


class MetricState(StrEnum):
    CURRENT = "CURRENT"
    STALE = "STALE"


@dataclass(frozen=True)
class TypedMetric:
    metric_id: str
    value: Decimal
    unit: str
    period: str
    classification: str
    source_ids: tuple[str, ...]
    formula_id: str | None = None
    operand_ids: tuple[str, ...] = ()
    assumption_ids: tuple[str, ...] = ()
    downstream_ids: tuple[str, ...] = ()
    currency: str | None = None
    state: MetricState = MetricState.CURRENT

    def __post_init__(self) -> None:
        if not self.metric_id or not self.unit or not self.period:
            raise UnderwritingError("typed_metric_identity_required")
        if self.classification not in CLASSIFICATIONS:
            raise UnderwritingError("typed_metric_classification_invalid")
        if self.unit == "currency" and not self.currency:
            raise UnderwritingError("typed_metric_currency_required")
        if self.formula_id is None and self.operand_ids:
            raise UnderwritingError("typed_metric_formula_required")
        if self.formula_id is not None and not self.operand_ids:
            raise UnderwritingError("typed_metric_operands_required")
        if not self.source_ids and not self.assumption_ids and not self.operand_ids:
            raise UnderwritingError("typed_metric_provenance_required")

    def as_dict(self) -> dict[str, Any]:
        return {
            "metric_id": self.metric_id,
            "value": format(self.value, "f"),
            "unit": self.unit,
            "currency": self.currency,
            "period": self.period,
            "classification": self.classification,
            "source_ids": list(self.source_ids),
            "formula_id": self.formula_id,
            "operand_ids": list(self.operand_ids),
            "assumption_ids": list(self.assumption_ids),
            "downstream_ids": list(self.downstream_ids),
            "state": self.state.value,
        }


@dataclass(frozen=True)
class FormulaSpec:
    formula_id: str
    operation: str
    operand_ids: tuple[str, ...]
    output_unit: str

    def __post_init__(self) -> None:
        arity = {"ADD": 2, "SUBTRACT": 2, "MULTIPLY": 2, "DIVIDE": 2, "MIN": 2, "MAX": 2}
        if self.operation not in arity:
            raise UnderwritingError("formula_operation_invalid")
        if len(self.operand_ids) != arity[self.operation] or len(set(self.operand_ids)) != len(self.operand_ids):
            raise UnderwritingError("formula_arity_invalid")

    def evaluate(self, values: Mapping[str, Decimal]) -> Decimal:
        try:
            left, right = (values[item] for item in self.operand_ids)
            if self.operation == "ADD":
                return left + right
            if self.operation == "SUBTRACT":
                return left - right
            if self.operation == "MULTIPLY":
                return left * right
            if self.operation == "DIVIDE":
                return left / right
            if self.operation == "MIN":
                return min(left, right)
            return max(left, right)
        except KeyError as exc:
            raise UnderwritingError(f"formula_operand_missing:{exc.args[0]}") from exc
        except (DivisionByZero, InvalidOperation) as exc:
            raise UnderwritingError("formula_arithmetic_invalid") from exc


class FormulaRegistry:
    """Exact simple identities only; iterative financial engines live outside this registry."""

    def __init__(self, formulas: Iterable[FormulaSpec]) -> None:
        formula_items = tuple(formulas)
        self._formulas = {item.formula_id: item for item in formula_items}
        if len(self._formulas) != len(formula_items):
            raise UnderwritingError("formula_identifier_duplicate")

    def evaluate(self, formula_id: str, values: Mapping[str, Decimal]) -> Decimal:
        try:
            formula = self._formulas[formula_id]
        except KeyError as exc:
            raise UnderwritingError(f"formula_missing:{formula_id}") from exc
        return formula.evaluate(values)

    def digest(self) -> str:
        body = [
            {
                "formula_id": item.formula_id,
                "operation": item.operation,
                "operand_ids": list(item.operand_ids),
                "output_unit": item.output_unit,
            }
            for item in sorted(self._formulas.values(), key=lambda item: item.formula_id)
        ]
        return digest(body)


def derive_decision_state(
    *,
    diagnostics: Sequence[Mapping[str, str]],
    stale_metric_ids: Sequence[str],
    open_conditions: int,
    signature_status: str,
) -> DecisionState:
    if open_conditions < 0:
        raise UnderwritingError("open_conditions_negative")
    if signature_status not in {"PENDING_FOUNDER_SIGNATURE", "SIGNED"}:
        raise UnderwritingError("signature_status_invalid")
    blocking = any(
        item.get("role") == DiagnosticRole.DECISION_CRITICAL.value
        and item.get("status") in {"FAIL", "BLOCKED", "STALE"}
        for item in diagnostics
    )
    if stale_metric_ids or blocking:
        return DecisionState.BLOCKED_EVIDENCE
    if open_conditions:
        return DecisionState.HOLD_OPEN_CONDITIONS
    if signature_status == "SIGNED":
        return DecisionState.SEALED
    return DecisionState.READY_FOR_ADJUDICATION


def propagate_staleness(
    *,
    changed_ids: Iterable[str],
    edges: Iterable[tuple[str, str]],
) -> set[str]:
    adjacency: dict[str, set[str]] = {}
    for parent, child in edges:
        adjacency.setdefault(parent, set()).add(child)
    stale = set(changed_ids)
    pending = list(stale)
    while pending:
        node_id = pending.pop()
        for child in adjacency.get(node_id, set()):
            if child not in stale:
                stale.add(child)
                pending.append(child)
    return stale
