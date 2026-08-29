from __future__ import annotations

from datetime import date

from scipy.optimize import brentq


def reference_npv(rate: float, cash_flows: list[tuple[date, int]]) -> float:
    origin = min(item[0] for item in cash_flows)
    return sum(
        amount / ((1.0 + rate) ** ((when - origin).days / 365.0))
        for when, amount in cash_flows
    )


def reference_xirr(cash_flows: list[tuple[date, int]]) -> float:
    """Independent float/Brent oracle, intentionally separate from production Decimal bisection."""
    return float(brentq(lambda rate: reference_npv(rate, cash_flows), -0.999999, 10.0))
