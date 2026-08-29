from __future__ import annotations

import csv
import hashlib
import math
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from .contracts import CONTRACT_VERSION, CUTOFF, digest, sha256_file, write_json
from .specs import analysis_specs


CASE_IDS = {"atlasgrid", "helios"}


def _seed_for(master_seed: int, stream: str) -> int:
    material = f"{master_seed}:{CONTRACT_VERSION}:{stream}".encode()
    return int.from_bytes(hashlib.sha256(material).digest()[:16], "big")


def _rng(master_seed: int, stream: str) -> np.random.Generator:
    return np.random.Generator(np.random.PCG64(_seed_for(master_seed, stream)))


def _write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
            count += 1
    return count


def _artifact(case_root: Path, relative: str, schema: str, rows: int) -> dict[str, Any]:
    path = case_root / relative
    return {
        "artifact_id": Path(relative).stem.replace("_", "-"),
        "path": relative,
        "schema": schema,
        "rows": rows,
        "sha256": sha256_file(path),
    }


def _month_label(index: int, *, start_year: int = 2021, start_month: int = 9) -> str:
    raw = start_month - 1 + index
    return f"{start_year + raw // 12:04d}-{raw % 12 + 1:02d}"


def _atlasgrid(case_root: Path, truth_root: Path, seed: int) -> list[dict[str, Any]]:
    entity_rng = _rng(seed, "atlasgrid/entities")
    event_rng = _rng(seed, "atlasgrid/events")
    experiment_rng = _rng(seed, "atlasgrid/experiments")
    parent_count = 220
    entity_count = 1600
    parent_weights = entity_rng.dirichlet(np.linspace(1.5, 0.35, parent_count))
    parent_ids = [f"AG-P{i:03d}" for i in range(1, parent_count + 1)]
    assigned = entity_rng.choice(parent_count, size=entity_count, p=parent_weights)
    segments = np.array(["Enterprise", "Upper mid-market", "Mid-market", "Public sector"])
    segment_probs = np.array([0.18, 0.30, 0.34, 0.18])
    starts = entity_rng.integers(0, 25, size=entity_count)
    base_mrr = np.maximum(85000, entity_rng.lognormal(math.log(310000), 0.62, entity_count)).astype(int)
    health = entity_rng.normal(0, 1, entity_count)
    entity_rows: list[dict[str, Any]] = []
    month_rows: list[dict[str, Any]] = []
    churn_months: list[int] = []
    for idx in range(entity_count):
        entity_id = f"AG-E{idx + 1:04d}"
        segment = str(entity_rng.choice(segments, p=segment_probs))
        parent_id = parent_ids[int(assigned[idx])]
        start = int(starts[idx])
        hazard = 0.0028 + max(0, -float(health[idx])) * 0.0016 + (0.001 if segment == "Mid-market" else 0)
        churn = 60
        for month in range(start + 6, 60):
            if event_rng.random() < hazard + max(0, month - 47) * 0.00008:
                churn = month
                break
        churn_months.append(churn)
        entity_rows.append(
            {
                "entity_id": entity_id,
                "parent_id": parent_id,
                "segment": segment,
                "start_month": _month_label(start),
                "contract_term_months": int(entity_rng.choice([12, 24, 36], p=[0.24, 0.51, 0.25])),
                "cancellation_for_convenience": "true" if idx % 17 == 0 else "false",
                "base_mrr_cents": int(base_mrr[idx]),
            }
        )
        mrr = int(base_mrr[idx])
        for month in range(start, 60):
            if month >= churn:
                active = 0
                mrr_value = 0
            else:
                active = 1
                annual_step = 1.03 if month and month % 12 == start % 12 else 1.0
                expansion = 1 + (0.0018 + max(0, health[idx]) * 0.0005)
                mrr = int(round(mrr * annual_step * expansion))
                mrr_value = mrr
            month_rows.append(
                {
                    "month": _month_label(month),
                    "entity_id": entity_id,
                    "parent_id": parent_id,
                    "segment": segment,
                    "active": active,
                    "mrr_cents": mrr_value,
                    "usage_units": int(max(0, (mrr_value / 2200) * (1 + event_rng.normal(0, 0.04)))),
                    "support_tickets": int(max(0, event_rng.poisson(2.2 + (1 - health[idx]) * 0.45))) if active else 0,
                    "credit_cents": int(mrr_value * 0.006) if active and (idx + month) % 23 == 0 else 0,
                }
            )
    artifacts: list[dict[str, Any]] = []
    rows = _write_csv(
        case_root / "data/customer_master.csv",
        list(entity_rows[0]),
        entity_rows,
    )
    artifacts.append(_artifact(case_root, "data/customer_master.csv", "atlasgrid.customer-master/v1", rows))
    rows = _write_csv(
        case_root / "data/customer_month.csv",
        list(month_rows[0]),
        month_rows,
    )
    artifacts.append(_artifact(case_root, "data/customer_month.csv", "atlasgrid.customer-month/v1", rows))
    billing_rows: list[dict[str, Any]] = []
    for row in month_rows:
        if not int(row["active"]):
            continue
        entity_number = int(str(row["entity_id"])[4:])
        live_arr = int(row["mrr_cents"]) * 12
        implementation_dependent = int(entity_number % 29 == 0)
        cancellable = int(entity_number % 17 == 0)
        booked_arr = live_arr + (int(live_arr * 0.18) if implementation_dependent else 0)
        net_invoice = int(row["mrr_cents"]) - int(row["credit_cents"])
        billing_rows.append(
            {
                "invoice_id": f'{row["month"]}-{row["entity_id"]}',
                "month": row["month"],
                "entity_id": row["entity_id"],
                "billed_subscription_cents": int(row["mrr_cents"]),
                "credit_cents": int(row["credit_cents"]),
                "net_invoice_cents": net_invoice,
                "collected_cents": int(net_invoice * (0.985 if cancellable else 0.997)),
                "live_arr_cents": live_arr,
                "booked_arr_cents": booked_arr,
                "implementation_dependent": implementation_dependent,
                "cancellable": cancellable,
            }
        )
    rows = _write_csv(case_root / "data/billing_ledger.csv", list(billing_rows[0]), billing_rows)
    artifacts.append(_artifact(case_root, "data/billing_ledger.csv", "atlasgrid.billing-ledger/v1", rows))

    monthly: list[dict[str, Any]] = []
    for month in range(60):
        current = [row for row in month_rows if row["month"] == _month_label(month)]
        subscription = sum(int(row["mrr_cents"]) for row in current)
        services = int(subscription * (0.075 if month < 48 else 0.092))
        credits = sum(int(row["credit_cents"]) for row in current)
        revenue = subscription + services - credits
        hosting = int(subscription * 0.145)
        implementation = int(services * 0.74)
        customer_success = int(subscription * 0.084)
        fully_burdened_cogs = hosting + implementation + customer_success
        reported_cogs = hosting + implementation
        opex = int(2_250_000_00 + month * 1_400_000 + event_rng.normal(0, 8_000_000))
        monthly.append(
            {
                "month": _month_label(month),
                "subscription_revenue_cents": subscription,
                "services_revenue_cents": services,
                "credits_cents": credits,
                "recognized_revenue_cents": revenue,
                "reported_cogs_cents": reported_cogs,
                "customer_success_cents": customer_success,
                "fully_burdened_cogs_cents": fully_burdened_cogs,
                "opex_cents": opex,
                "reported_ebitda_cents": revenue - reported_cogs - opex,
                "normalized_ebitda_cents": revenue - fully_burdened_cogs - opex,
            }
        )
    rows = _write_csv(case_root / "data/monthly_pnl.csv", list(monthly[0]), monthly)
    artifacts.append(_artifact(case_root, "data/monthly_pnl.csv", "atlasgrid.monthly-pnl/v1", rows))
    last_revenue = int(monthly[-1]["recognized_revenue_cents"]) * 12
    last_ebitda = int(monthly[-1]["normalized_ebitda_cents"]) * 12
    forecast_rows: list[dict[str, Any]] = []
    for year in range(1, 6):
        for scenario, revenue_growth, margin_delta in (("management", 0.18, 0.030), ("base", 0.11, 0.015), ("downside", 0.03, -0.010)):
            revenue_value = int(last_revenue * (1 + revenue_growth) ** year)
            base_margin = last_ebitda / last_revenue
            forecast_rows.append(
                {
                    "year": year,
                    "scenario": scenario,
                    "revenue_cents": revenue_value,
                    "normalized_ebitda_cents": int(revenue_value * (base_margin + margin_delta * year)),
                }
            )
    rows = _write_csv(case_root / "data/forecast.csv", list(forecast_rows[0]), forecast_rows)
    artifacts.append(_artifact(case_root, "data/forecast.csv", "atlasgrid.forecast/v1", rows))

    ltm_reported = sum(int(row["reported_ebitda_cents"]) for row in monthly[-12:])
    ltm_customer_success = sum(int(row["customer_success_cents"]) for row in monthly[-12:])
    addbacks = [
        {"item": "Seller adjusted EBITDA", "amount_cents": ltm_reported + 255_000_000, "treatment": "starting_point"},
        {"item": "Customer-success burden", "amount_cents": -ltm_customer_success, "treatment": "normalize"},
        {"item": "Non-recurring implementation pull-forward", "amount_cents": -155_000_000, "treatment": "normalize"},
        {"item": "Challenged transformation add-back", "amount_cents": -100_000_000, "treatment": "normalize"},
    ]
    rows = _write_csv(case_root / "data/qoe_bridge.csv", list(addbacks[0]), addbacks)
    artifacts.append(_artifact(case_root, "data/qoe_bridge.csv", "atlasgrid.qoe-bridge/v1", rows))

    pricing_rows: list[dict[str, Any]] = []
    for idx in range(800):
        treatment = int(experiment_rng.random() < 0.5)
        risk = float(experiment_rng.normal(0, 1))
        realized = max(0.0, 8.0 * treatment - 1.8 * risk + experiment_rng.normal(0, 0.9))
        renewal_probability = 0.93 - 0.05 * treatment - 0.035 * max(risk, 0)
        renewed = int(experiment_rng.random() < renewal_probability)
        pricing_rows.append(
            {
                "account_id": f"AG-R{idx + 1:04d}",
                "treatment": treatment,
                "risk_score": f"{risk:.6f}",
                "realized_increase_pct": f"{realized:.6f}",
                "renewed": renewed,
            }
        )
    rows = _write_csv(case_root / "data/pricing_experiment.csv", list(pricing_rows[0]), pricing_rows)
    artifacts.append(_artifact(case_root, "data/pricing_experiment.csv", "atlasgrid.pricing-experiment/v1", rows))

    pod_rows: list[dict[str, Any]] = []
    for pod in range(40):
        treated = int(pod < 20)
        pod_effect = float(experiment_rng.normal(0, 1.2))
        for month in range(24):
            post = int(month >= 12)
            resolution = 23.0 + pod_effect - 4.8 * treated * post + 0.05 * month + experiment_rng.normal(0, 0.7)
            churn_bps = 92 + pod_effect * 2 - 16 * treated * post + experiment_rng.normal(0, 5)
            pod_rows.append(
                {
                    "pod_id": f"AG-S{pod + 1:02d}",
                    "period": month - 12,
                    "treated": treated,
                    "post": post,
                    "resolution_hours": f"{resolution:.6f}",
                    "gross_churn_bps": f"{churn_bps:.6f}",
                }
            )
    rows = _write_csv(case_root / "data/support_rollout.csv", list(pod_rows[0]), pod_rows)
    artifacts.append(_artifact(case_root, "data/support_rollout.csv", "atlasgrid.support-rollout/v1", rows))

    debt_terms = {
        "schema_version": "atlasgrid.debt-terms/v1",
        "ask_enterprise_value_cents": 24_000_000_000,
        "repriced_enterprise_value_cents": 21_000_000_000,
        "entry_debt_cents": 12_000_000_000,
        "exit_debt_base_cents": 6_000_000_000,
        "exit_debt_downside_cents": 8_000_000_000,
        "base_exit_ebitda_cents": 3_500_000_000,
        "downside_exit_ebitda_cents": 2_800_000_000,
        "base_exit_multiple": "9.00",
        "downside_exit_multiple": "7.50",
        "gross_irr_hurdle_pct": "22.00",
        "moic_hurdle": "2.00",
        "hold_years": 5,
        "monte_carlo": {
            "draws": 20000,
            "exit_ebitda_mean_cents": 3_250_000_000,
            "exit_ebitda_sd_cents": 520_000_000,
            "exit_ebitda_floor_cents": 1_400_000_000,
            "exit_multiple_mean": "8.30",
            "exit_multiple_sd": "1.15",
            "exit_multiple_floor": "4.50",
            "exit_multiple_cap": "12.00",
            "exit_debt_mean_cents": 6_800_000_000,
            "exit_debt_sd_cents": 1_050_000_000,
            "exit_debt_floor_cents": 2_000_000_000
        },
    }
    write_json(case_root / "data/debt_terms.json", debt_terms)
    artifacts.append(_artifact(case_root, "data/debt_terms.json", "atlasgrid.debt-terms/v1", 1))
    debt_rows: list[dict[str, Any]] = []
    for scenario, exit_debt, opening_ebitda, growth in (("base", 6_000_000_000, 3_000_000_000, 0.04), ("downside", 8_000_000_000, 2_400_000_000, 0.01)):
        opening_debt = debt_terms["entry_debt_cents"]
        annual_paydown = (opening_debt - exit_debt) // 5
        for year in range(1, 6):
            ending_debt = opening_debt - annual_paydown
            ebitda = int(opening_ebitda * (1 + growth) ** (year - 1))
            leverage = ending_debt / ebitda
            covenant = 4.25 if year <= 2 else 3.75
            debt_rows.append(
                {
                    "scenario": scenario,
                    "year": year,
                    "opening_debt_cents": opening_debt,
                    "mandatory_paydown_cents": annual_paydown,
                    "ending_debt_cents": ending_debt,
                    "covenant_ebitda_cents": ebitda,
                    "net_leverage": f"{leverage:.6f}",
                    "maximum_net_leverage": f"{covenant:.2f}",
                    "covenant_status": "BREACH" if leverage > covenant else "PASS",
                }
            )
            opening_debt = ending_debt
    rows = _write_csv(case_root / "data/debt_schedule.csv", list(debt_rows[0]), debt_rows)
    artifacts.append(_artifact(case_root, "data/debt_schedule.csv", "atlasgrid.debt-schedule/v1", rows))
    cim = """# AtlasGrid Systems — synthetic confidential information memorandum\n\nSYNTHETIC — NOT INVESTMENT ADVICE\n\nManagement presents durable mission-critical grid software, 111% active-customer NRR, 78% reported gross margin, and $29 million seller-adjusted EBITDA. The data room contains the customer, cost, QoE, and financing records required to challenge those definitions.\n"""
    (case_root / "data/CIM.md").write_text(cim, encoding="utf-8")
    artifacts.append(_artifact(case_root, "data/CIM.md", "atlasgrid.cim/v1", 1))
    truth = {
        "schema_version": "underwriting.truth/v1",
        "case_id": "atlasgrid",
        "master_seed": str(seed),
        "price_rct_ate": "-0.05",
        "support_resolution_att_hours": "-4.80",
        "support_churn_att_bps": "-16.00",
        "entity_count": entity_count,
        "parent_count": parent_count,
        "churn_events": sum(1 for value in churn_months if value < 60),
        "distortions": ["booked_arr", "active_only_nrr", "entity_concentration", "gross_margin", "qoe_addbacks", "forecast_optimism"],
    }
    write_json(truth_root / "ground_truth.json", truth)
    return artifacts


def _helios(case_root: Path, truth_root: Path, seed: int) -> list[dict[str, Any]]:
    entity_rng = _rng(seed, "helios/entities")
    event_rng = _rng(seed, "helios/events")
    experiment_rng = _rng(seed, "helios/experiments")
    customer_count = 480
    customer_rows: list[dict[str, Any]] = []
    month_rows: list[dict[str, Any]] = []
    for idx in range(customer_count):
        customer_id = f"HX-C{idx + 1:04d}"
        cohort = int(entity_rng.integers(0, 12))
        start = cohort * 3
        design_partner = int(cohort < 3 and idx < 90)
        segment = str(entity_rng.choice(["Scale-up", "Enterprise", "AI native", "Research"], p=[0.34, 0.25, 0.29, 0.12]))
        base_spend = int(max(2_000_000, entity_rng.lognormal(math.log(18_000_000), 0.85)))
        customer_rows.append(
            {
                "customer_id": customer_id,
                "cohort": f"2023-Q{3 + cohort}" if cohort < 2 else f"{2024 + (cohort - 2) // 4}-Q{(cohort - 2) % 4 + 1}",
                "cohort_index": cohort,
                "segment": segment,
                "design_partner": design_partner,
                "start_period": start,
            }
        )
        spend = base_spend
        active = True
        for month in range(start, 36):
            if active and event_rng.random() < (0.003 if design_partner else 0.008):
                active = False
            growth = 1.025 + (0.045 if design_partner else 0) + event_rng.normal(0, 0.012)
            spend = int(max(0, spend * growth)) if active else 0
            take_rate_bps = 285 if segment != "Enterprise" else 235
            platform_fee = 85_000 if active else 0
            revenue = int(spend * take_rate_bps / 10000) + platform_fee
            cogs = int(revenue * (0.36 - min(month, 35) * 0.0022))
            compute_cost = int(cogs * 0.68)
            telemetry_cost = int(cogs * 0.17)
            support_cost = cogs - compute_cost - telemetry_cost
            month_rows.append(
                {
                    "month": _month_label(month, start_year=2023, start_month=9),
                    "customer_id": customer_id,
                    "cohort_index": cohort,
                    "design_partner": design_partner,
                    "active": int(active),
                    "managed_spend_cents": spend,
                    "take_rate_bps": take_rate_bps,
                    "platform_fee_cents": platform_fee,
                    "revenue_cents": revenue,
                    "compute_cost_cents": compute_cost,
                    "telemetry_cost_cents": telemetry_cost,
                    "support_cost_cents": support_cost,
                    "cogs_cents": cogs,
                }
            )
    artifacts: list[dict[str, Any]] = []
    rows = _write_csv(case_root / "data/customer_master.csv", list(customer_rows[0]), customer_rows)
    artifacts.append(_artifact(case_root, "data/customer_master.csv", "helios.customer-master/v1", rows))
    rows = _write_csv(case_root / "data/customer_month.csv", list(month_rows[0]), month_rows)
    artifacts.append(_artifact(case_root, "data/customer_month.csv", "helios.customer-month/v1", rows))

    monthly: list[dict[str, Any]] = []
    for month in range(36):
        label = _month_label(month, start_year=2023, start_month=9)
        current = [row for row in month_rows if row["month"] == label]
        revenue = sum(int(row["revenue_cents"]) for row in current)
        cogs = sum(int(row["cogs_cents"]) for row in current)
        opex = int(4_100_000_00 + month * 3_400_000 + event_rng.normal(0, 6_000_000))
        acquisitions = sum(1 for row in customer_rows if int(row["start_period"]) == month)
        sales_marketing = int(opex * 0.42)
        monthly.append(
            {
                "month": label,
                "revenue_cents": revenue,
                "cogs_cents": cogs,
                "gross_profit_cents": revenue - cogs,
                "opex_cents": opex,
                "sales_marketing_cents": sales_marketing,
                "new_customers": acquisitions,
                "net_burn_cents": max(0, opex + cogs - revenue),
                "ending_cash_cents": 0,
            }
        )
    cutoff_cash = 1_900_000_000
    opening_cash = cutoff_cash + sum(int(row["net_burn_cents"]) for row in monthly)
    cumulative_burn = 0
    for row in monthly:
        cumulative_burn += int(row["net_burn_cents"])
        row["ending_cash_cents"] = opening_cash - cumulative_burn
    rows = _write_csv(case_root / "data/monthly_pnl.csv", list(monthly[0]), monthly)
    artifacts.append(_artifact(case_root, "data/monthly_pnl.csv", "helios.monthly-pnl/v1", rows))

    pipeline_rows: list[dict[str, Any]] = []
    for idx in range(320):
        actual_stage = int(entity_rng.integers(1, 6))
        inflated = int(idx < 48)
        reported_stage = min(6, actual_stage + inflated)
        amount = int(max(250_000, entity_rng.lognormal(math.log(3_500_000), 0.7)))
        pipeline_rows.append(
            {
                "opportunity_id": f"HX-O{idx + 1:04d}",
                "actual_stage": actual_stage,
                "reported_stage": reported_stage,
                "inflated": inflated,
                "amount_cents": amount,
            }
        )
    rows = _write_csv(case_root / "data/pipeline.csv", list(pipeline_rows[0]), pipeline_rows)
    artifacts.append(_artifact(case_root, "data/pipeline.csv", "helios.pipeline/v1", rows))

    adoption_rates = [0.62, 0.48, 0.33, 0.18, 0.08]
    survey_sizes = [120, 110, 90, 77, 3]
    survey_rows: list[dict[str, Any]] = []
    for tier, (rate, size) in enumerate(zip(adoption_rates, survey_sizes, strict=True), start=1):
        for idx in range(size):
            survey_rows.append(
                {
                    "respondent_id": f"HX-S{tier}-{idx + 1:03d}",
                    "tier": tier,
                    "adopted": int(entity_rng.random() < rate),
                    "annual_ai_spend_cents": int((6 - tier) * 48_000_000 + entity_rng.normal(0, 5_000_000)),
                }
            )
    rows = _write_csv(case_root / "data/market_survey.csv", list(survey_rows[0]), survey_rows)
    artifacts.append(_artifact(case_root, "data/market_survey.csv", "helios.market-survey/v1", rows))
    market_assumptions = {
        "schema_version": "helios.market-assumptions/v1",
        "stage_probabilities": {"1": "0.08", "2": "0.16", "3": "0.32", "4": "0.52", "5": "0.74", "6": "0.88"},
        "universe_counts": [5000, 7500, 9500, 11000, 8000],
        "tier_mid_spend_cents": [240000000, 192000000, 144000000, 96000000, 48000000],
        "adoption_prior": "Beta(1,1)",
        "credible_interval": "90%"
    }
    write_json(case_root / "data/market_assumptions.json", market_assumptions)
    artifacts.append(_artifact(case_root, "data/market_assumptions.json", "helios.market-assumptions/v1", 1))

    experiment_rows: list[dict[str, Any]] = []
    for idx in range(120):
        treatment = int(idx < 60)
        baseline = float(experiment_rng.normal(0, 0.17))
        effect = -0.11 * treatment
        outcome = baseline + effect + float(experiment_rng.normal(0, 0.08))
        experiment_rows.append(
            {
                "customer_id": f"HX-X{idx + 1:03d}",
                "treatment": treatment,
                "baseline_log_cost": f"{baseline:.6f}",
                "outcome_log_cost_change": f"{outcome:.6f}",
            }
        )
    rows = _write_csv(case_root / "data/optimizer_experiment.csv", list(experiment_rows[0]), experiment_rows)
    artifacts.append(_artifact(case_root, "data/optimizer_experiment.csv", "helios.optimizer-experiment/v1", rows))

    cap_table = {
        "schema_version": "helios.cap-table/v1",
        "common_shares": 6_100_000,
        "option_pool_shares": 1_400_000,
        "series_a_shares": 2_050_000,
        "series_b_shares": 1_850_000,
        "series_b_participating_cap": "2.00",
        "new_money_cents": 4_000_000_000,
        "pre_money_cents": 16_000_000_000,
        "series_c_preference": "1x_non_participating",
        "cash_at_cutoff_cents": cutoff_cash,
        "series_a_preference_cents": 1_200_000_000,
        "series_b_preference_cents": 2_400_000_000,
    }
    write_json(case_root / "data/cap_table.json", cap_table)
    artifacts.append(_artifact(case_root, "data/cap_table.json", "helios.cap-table/v1", 1))
    venture_scenarios = {
        "schema_version": "helios.venture-scenarios/v1",
        "draws": 20000,
        "failure_probability": "0.38",
        "success_exit_log_mean_cents": 65000000000,
        "success_exit_log_sigma": "0.88",
        "failure_exit_floor_cents": 0,
        "failure_exit_cap_cents": 6000000000,
        "dilution_beta_alpha": "8.00",
        "dilution_beta_beta": "24.00",
        "dilution_cap": "0.45"
    }
    write_json(case_root / "data/venture_scenarios.json", venture_scenarios)
    artifacts.append(_artifact(case_root, "data/venture_scenarios.json", "helios.venture-scenarios/v1", 1))
    cim = """# Helios Compute Control — synthetic Series C memorandum\n\nSYNTHETIC — NOT INVESTMENT ADVICE\n\nHelios presents a control plane for enterprise GPU spend. The room contains customer usage, cohort, experiment, pipeline, market, cash, and ownership records required to test the conditional investment case.\n"""
    (case_root / "data/MEMORANDUM.md").write_text(cim, encoding="utf-8")
    artifacts.append(_artifact(case_root, "data/MEMORANDUM.md", "helios.memorandum/v1", 1))
    truth = {
        "schema_version": "underwriting.truth/v1",
        "case_id": "helios",
        "master_seed": str(seed),
        "optimizer_ate_log_cost": "-0.11",
        "market_adoption_rates": [str(value) for value in adoption_rates],
        "pipeline_inflated_count": 48,
        "customer_count": customer_count,
        "distortions": ["design_partner_selection", "pipeline_inflation", "survivor_comparables"],
    }
    write_json(truth_root / "ground_truth.json", truth)
    return artifacts


def generate_room(case_id: str, seed: int, output: str | Path) -> Path:
    if case_id not in CASE_IDS:
        raise ValueError("case_id_invalid")
    output_root = Path(output)
    case_root = output_root / "case"
    truth_root = output_root / "verification" / "truth"
    case_root.mkdir(parents=True, exist_ok=True)
    truth_root.mkdir(parents=True, exist_ok=True)
    artifacts = _atlasgrid(case_root, truth_root, seed) if case_id == "atlasgrid" else _helios(case_root, truth_root, seed)
    seed_commitment = hashlib.sha256(f"{seed}:{case_id}".encode()).hexdigest()
    manifest: dict[str, Any] = {
        "schema_version": "underwriting.dataroom-manifest/v1",
        "case_id": case_id,
        "synthetic": True,
        "disclosure": "SYNTHETIC — NOT INVESTMENT ADVICE",
        "contract_version": CONTRACT_VERSION,
        "cutoff": CUTOFF,
        "seed_commitment": seed_commitment,
        "generator": "underwriting_lab.generator/v1",
        "artifacts": artifacts,
        "analysis_specs": analysis_specs(case_id),
    }
    manifest["manifest_sha256"] = digest(manifest)
    write_json(case_root / "manifest.json", manifest)
    truth_manifest = {
        "schema_version": "underwriting.truth-manifest/v1",
        "case_id": case_id,
        "seed": str(seed),
        "seed_commitment": seed_commitment,
        "ground_truth_sha256": sha256_file(truth_root / "ground_truth.json"),
        "case_manifest_sha256": manifest["manifest_sha256"],
    }
    write_json(truth_root / "manifest.json", truth_manifest)
    return case_root / "manifest.json"
