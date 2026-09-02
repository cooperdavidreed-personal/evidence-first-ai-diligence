from __future__ import annotations

import csv
import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP, localcontext
from pathlib import Path

QUANTUM = Decimal("0.000000000001")


def _integer(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _ratio(value: Decimal) -> str:
    return str(value.quantize(QUANTUM, rounding=ROUND_HALF_UP))


def calculate(package_dir: Path) -> dict[str, int | str]:
    deal = json.loads((package_dir / "deal.json").read_text(encoding="utf-8"))
    with (package_dir / "monthly_financials.csv").open(newline="", encoding="utf-8") as handle:
        monthly = list(csv.DictReader(handle))
    with (package_dir / "customer_arr.csv").open(newline="", encoding="utf-8") as handle:
        customers = list(csv.DictReader(handle))

    ltm = monthly[-12:]
    revenue = sum(int(row["revenue_cents"]) for row in ltm)
    cost = sum(int(row["cost_of_revenue_cents"]) for row in ltm)
    burns = [int(row["cost_of_revenue_cents"]) + int(row["operating_expense_cents"]) - int(row["revenue_cents"]) for row in monthly[-3:]]
    recent_burn = _integer(Decimal(sum(burns)) / Decimal(len(burns)))

    periods = sorted({row["period"] for row in customers})
    start, end = periods[0], periods[-1]
    start_year, start_month = map(int, start.split("-"))
    end_year, end_month = map(int, end.split("-"))
    elapsed = (end_year * 12 + end_month - 1) - (start_year * 12 + start_month - 1)
    opening = {row["customer_id"]: int(row["arr_cents"]) for row in customers if row["period"] == start and int(row["arr_cents"]) > 0}
    closing = {row["customer_id"]: int(row["arr_cents"]) for row in customers if row["period"] == end}
    base_arr = sum(opening.values())
    ending_arr = sum(closing.get(customer_id, 0) for customer_id in opening)

    investment = int(deal["proposed_financing"]["investment_cents"])
    pre_money = int(deal["proposed_financing"]["pre_money_cents"])
    years = int(deal["return_assumptions"]["years"])
    growth = Decimal(deal["return_assumptions"]["annual_revenue_growth"])
    exit_multiple = Decimal(deal["return_assumptions"]["exit_revenue_multiple"])

    with localcontext() as context:
        context.prec = 60
        gross_margin = (Decimal(revenue) - Decimal(cost)) / Decimal(revenue)
        runway = Decimal(int(deal["cash_cents"])) / Decimal(recent_burn)
        nrr = Decimal(ending_arr) / Decimal(base_arr)
        ownership = Decimal(investment) / Decimal(pre_money + investment)
        terminal_revenue = _integer(Decimal(revenue) * ((Decimal(1) + growth) ** years))
        exit_equity = _integer(Decimal(terminal_revenue) * exit_multiple)
        gross_proceeds = _integer(Decimal(exit_equity) * ownership)
        moic = Decimal(gross_proceeds) / Decimal(investment)
        annualized = moic ** (Decimal(1) / Decimal(years)) - Decimal(1)

    return {
        "ltm_revenue_cents": revenue,
        "ltm_cost_cents": cost,
        "gross_margin": _ratio(gross_margin),
        "recent_net_burn_cents": recent_burn,
        "runway_months": _ratio(runway),
        "cohort_elapsed_months": elapsed,
        "ordinary_nrr": _ratio(nrr),
        "post_money_ownership": _ratio(ownership),
        "terminal_revenue_cents": terminal_revenue,
        "exit_equity_cents": exit_equity,
        "gross_proceeds_cents": gross_proceeds,
        "gross_moic": _ratio(moic),
        "annualized_gross_return": _ratio(annualized),
    }


def file_receipt(path: Path) -> dict[str, int | str]:
    payload = path.read_bytes()
    return {"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
