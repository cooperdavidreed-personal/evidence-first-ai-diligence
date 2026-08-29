from __future__ import annotations

from decimal import Decimal, ROUND_HALF_EVEN
from fractions import Fraction
from itertools import product
from typing import Iterable

from underwriting_lab.vc_engine import Holder, PreferenceTerms


def _largest_remainder(total: int, weights: dict[str, int]) -> dict[str, int]:
    active = {key: weight for key, weight in weights.items() if weight > 0}
    if total == 0:
        return {key: 0 for key in weights}
    denominator = sum(active.values())
    exact = {
        key: Fraction(total * weight, denominator) for key, weight in active.items()
    }
    paid = {key: value.numerator // value.denominator for key, value in exact.items()}
    for key in sorted(
        active,
        key=lambda item: (-(exact[item] - paid[item]), item),
    )[: total - sum(paid.values())]:
        paid[key] += 1
    return {key: paid.get(key, 0) for key in weights}


def _allocation(
    exit_value: int,
    profile: dict[str, bool],
    class_shares: dict[str, int],
    common_shares: int,
    terms: dict[str, PreferenceTerms],
) -> tuple[dict[str, int], int]:
    paid = {class_id: 0 for class_id in terms}
    remaining = exit_value
    for rank in sorted({term.seniority for term in terms.values()}):
        claims = {
            class_id: int(
                (Decimal(term.invested_cents) * term.preference_multiple).quantize(
                    Decimal("1"), rounding=ROUND_HALF_EVEN
                )
            )
            for class_id, term in terms.items()
            if term.seniority == rank and not profile[class_id]
        }
        tranche = _largest_remainder(min(remaining, sum(claims.values())), claims)
        for class_id, amount in tranche.items():
            paid[class_id] += amount
        remaining -= sum(tranche.values())

    residual_weights = {"COMMON": common_shares}
    caps: dict[str, int | None] = {"COMMON": None}
    for class_id, term in terms.items():
        residual_weights[class_id] = (
            class_shares[class_id]
            if profile[class_id]
            or term.participation in {"PARTICIPATING", "CAPPED_PARTICIPATING"}
            else 0
        )
        caps[class_id] = (
            int(
                (Decimal(term.invested_cents) * term.participation_cap_multiple).quantize(
                    Decimal("1"), rounding=ROUND_HALF_EVEN
                )
            )
            if not profile[class_id]
            and term.participation == "CAPPED_PARTICIPATING"
            and term.participation_cap_multiple is not None
            else None
        )
    eligible = {key for key, weight in residual_weights.items() if weight > 0}
    common_paid = 0
    while remaining and eligible:
        proposed = _largest_remainder(
            remaining, {key: residual_weights[key] for key in eligible}
        )
        capped: set[str] = set()
        distributed = 0
        for key in sorted(eligible):
            amount = proposed[key]
            cap = caps[key]
            already = common_paid if key == "COMMON" else paid[key]
            if cap is not None and already + amount > cap:
                amount = max(0, cap - already)
                capped.add(key)
            if key == "COMMON":
                common_paid += amount
            else:
                paid[key] += amount
            distributed += amount
        remaining -= distributed
        eligible -= capped
        if not capped:
            break
    common_paid += remaining
    return paid, common_paid


def reference_waterfall(
    exit_value_cents: int,
    holders: Iterable[Holder],
    preferences: Iterable[PreferenceTerms],
) -> tuple[dict[str, bool], dict[str, int], int]:
    holder_rows = tuple(holders)
    terms = {term.class_id: term for term in preferences}
    class_ids = sorted(terms)
    class_shares = {
        class_id: sum(row.shares for row in holder_rows if row.class_id == class_id)
        for class_id in class_ids
    }
    common_shares = sum(row.shares for row in holder_rows if row.class_id == "COMMON")
    candidates: dict[tuple[bool, ...], tuple[dict[str, int], int]] = {}
    for choices in product((False, True), repeat=len(class_ids)):
        candidates[choices] = _allocation(
            exit_value_cents,
            dict(zip(class_ids, choices, strict=True)),
            class_shares,
            common_shares,
            terms,
        )
    stable: list[tuple[bool, ...]] = []
    for choices, (proceeds, _) in candidates.items():
        if all(
            candidates[
                tuple(not value if position == index else value for position, value in enumerate(choices))
            ][0][class_id]
            <= proceeds[class_id]
            and not (
                candidates[
                    tuple(not value if position == index else value for position, value in enumerate(choices))
                ][0][class_id]
                == proceeds[class_id]
                and choices[index]
            )
            for index, class_id in enumerate(class_ids)
        ):
            stable.append(choices)
    if len(stable) != 1:
        raise AssertionError(f"reference_legal_profile_count:{len(stable)}")
    profile = dict(zip(class_ids, stable[0], strict=True))
    proceeds, common = candidates[stable[0]]
    return profile, proceeds, common


def reference_breakpoints(
    holders: Iterable[Holder],
    preferences: Iterable[PreferenceTerms],
    maximum_exit_cents: int,
) -> list[int]:
    holder_rows = tuple(holders)
    term_rows = tuple(preferences)
    cursor = 0
    profile, _, _ = reference_waterfall(cursor, holder_rows, term_rows)
    terminal, _, _ = reference_waterfall(maximum_exit_cents, holder_rows, term_rows)
    points: list[int] = []
    while profile != terminal:
        low, high = cursor + 1, maximum_exit_cents
        while low < high:
            midpoint = (low + high) // 2
            candidate, _, _ = reference_waterfall(midpoint, holder_rows, term_rows)
            if candidate == profile:
                low = midpoint + 1
            else:
                high = midpoint
        points.append(low)
        cursor = low
        profile, _, _ = reference_waterfall(cursor, holder_rows, term_rows)
    return points
