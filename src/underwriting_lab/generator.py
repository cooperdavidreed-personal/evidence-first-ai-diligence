from __future__ import annotations

import csv
import hashlib
import math
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from .contracts import CONTRACT_VERSION, CUTOFF, digest, sha256_file, write_json
from .experiments import atlasgrid_experiment_fixture, helios_optimizer_fixture
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


def _month_label(index: int, *, start_year: int = 2021, start_month: int = 8) -> str:
    raw = start_month - 1 + index
    return f"{start_year + raw // 12:04d}-{raw % 12 + 1:02d}"


def _atlasgrid(case_root: Path, truth_root: Path, seed: int) -> list[dict[str, Any]]:
    entity_rng = _rng(seed, "atlasgrid/entities")
    event_rng = _rng(seed, "atlasgrid/events")
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
            if event_rng.random() < hazard + max(0, month - 47) * 0.00020:
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

    pricing_rows, pod_rows = atlasgrid_experiment_fixture(
        seed, include_post_cutoff_sentinel=True
    )
    rows = _write_csv(case_root / "data/pricing_experiment.csv", list(pricing_rows[0]), pricing_rows)
    artifacts.append(_artifact(case_root, "data/pricing_experiment.csv", "atlasgrid.pricing-experiment/v2", rows))

    rows = _write_csv(case_root / "data/support_rollout.csv", list(pod_rows[0]), pod_rows)
    artifacts.append(_artifact(case_root, "data/support_rollout.csv", "atlasgrid.support-rollout/v1", rows))

    debt_terms = {
        "schema_version": "atlasgrid.debt-terms/v2",
        "ask_enterprise_value_cents": 24_000_000_000,
        "selected_upfront_enterprise_value_cents": 21_000_000_000,
        "funded_term_face_cents": 12_000_000_000,
        "term_oid_rate": "0.02",
        "transaction_fee_rate": "0.02",
        "financing_fee_rate": "0.02",
        "seller_rollover_cents": 0,
        "minimum_cash_cents": 300_000_000,
        "revolver_commitment_cents": 2_000_000_000,
        "annual_cash_rate": "0.09",
        "annual_pik_rate": "0.00",
        "annual_mandatory_amortization_rate": "0.01",
        "sweep_rate": "0.75",
        "maximum_gross_leverage": "5.25",
        "maturity_months": 72,
        "interest_balance_convention": "BEGINNING_FUNDED_PRINCIPAL",
        "paydown_priority": ["REVOLVER", "TERM"],
        "base_exit_multiple": "6.50",
        "downside_exit_multiple": "5.00",
        "gross_irr_hurdle_pct": "22.00",
        "moic_hurdle": "2.00",
        "hold_months": 60,
        "earnout": {
            "metric": "verified_live_arr_cents_month_24",
            "threshold_cents": 8_800_000_000,
            "cap_cents": 2_000_000_000,
            "full_payout_at_percent_of_threshold": "120.00",
            "payment_month": 25,
            "funding": "additional_sponsor_equity"
        }
    }
    write_json(case_root / "data/debt_terms.json", debt_terms)
    artifacts.append(_artifact(case_root, "data/debt_terms.json", "atlasgrid.debt-terms/v2", 1))
    base_label, end_label = _month_label(47), _month_label(59)
    base_entities = {row["entity_id"] for row in month_rows if row["month"] == base_label and int(row["mrr_cents"]) > 0}
    ending_active = {row["entity_id"]: int(row["mrr_cents"]) for row in month_rows if row["month"] == end_label and int(row["mrr_cents"]) > 0}
    base_active = {row["entity_id"]: int(row["mrr_cents"]) for row in month_rows if row["month"] == base_label and row["entity_id"] in base_entities}
    retained_entities = base_entities.intersection(ending_active)
    active_only_nrr = sum(ending_active[entity_id] for entity_id in retained_entities) / sum(base_active[entity_id] for entity_id in retained_entities)
    ltm_revenue = sum(int(row["recognized_revenue_cents"]) for row in monthly[-12:])
    ltm_reported_cogs = sum(int(row["reported_cogs_cents"]) for row in monthly[-12:])
    reported_margin = 1 - ltm_reported_cogs / ltm_revenue
    seller_adjusted = int(addbacks[0]["amount_cents"])
    cim = f"""# AtlasGrid Systems — synthetic confidential information memorandum\n\nSYNTHETIC — NOT INVESTMENT ADVICE\n\nManagement presents durable mission-critical grid software, {active_only_nrr * 100:.2f}% active-customer NRR, {reported_margin * 100:.2f}% reported gross margin, and ${seller_adjusted / 100_000_000:.2f} million seller-adjusted EBITDA. The data room contains the customer, cost, QoE, and financing records required to challenge those definitions.\n"""
    (case_root / "data/CIM.md").write_text(cim, encoding="utf-8")
    artifacts.append(_artifact(case_root, "data/CIM.md", "atlasgrid.cim/v1", 1))
    truth = {
        "schema_version": "underwriting.truth/v1",
        "case_id": "atlasgrid",
        "master_seed": str(seed),
        "price_rct_ate": "-0.05",
        "annualized_churn_target_pct": "4.00",
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
                    "month": _month_label(month, start_year=2023, start_month=8),
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
        label = _month_label(month, start_year=2023, start_month=8)
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

    stage_probabilities = {"1": "0.08", "2": "0.16", "3": "0.32", "4": "0.52", "5": "0.74", "6": "0.88"}
    pipeline_rows: list[dict[str, Any]] = []
    stage_history_rows: list[dict[str, Any]] = []
    inflated_opportunity_ids: list[str] = []
    pipeline_weighted_inflation_cents = Decimal(0)
    for idx in range(320):
        actual_stage = int(entity_rng.integers(1, 6))
        inflated = int(idx < 48)
        reported_stage = min(6, actual_stage + inflated)
        opportunity_id = f"HX-O{idx + 1:04d}"
        if inflated:
            inflated_opportunity_ids.append(opportunity_id)
        amount = int(max(250_000, entity_rng.lognormal(math.log(3_500_000), 0.7)))
        if idx < 312:
            pipeline_weighted_inflation_cents += Decimal(amount) * (
                Decimal(stage_probabilities[str(reported_stage)]) - Decimal(stage_probabilities[str(actual_stage)])
            )
        pipeline_rows.append(
            {
                "opportunity_id": opportunity_id,
                "reported_stage": reported_stage,
                "amount_cents": amount,
            }
        )
        observations = 10 if idx >= 312 else 18
        for observation in range(observations):
            stage = min(actual_stage, 1 + int(observation * actual_stage / observations))
            stage_history_rows.append(
                {
                    "opportunity_id": opportunity_id,
                    "observation_index": observation + 1,
                    "stage": stage,
                }
            )
    rows = _write_csv(case_root / "data/pipeline.csv", list(pipeline_rows[0]), pipeline_rows)
    artifacts.append(_artifact(case_root, "data/pipeline.csv", "helios.pipeline/v1", rows))
    rows = _write_csv(case_root / "data/stage_history.csv", list(stage_history_rows[0]), stage_history_rows)
    artifacts.append(_artifact(case_root, "data/stage_history.csv", "helios.stage-history/v1", rows))

    adoption_rates = [0.62, 0.48, 0.33, 0.18, 0.08]
    survey_sizes = [120, 110, 90, 77, 3]
    survey_rows: list[dict[str, Any]] = []
    for tier, (rate, size) in enumerate(zip(adoption_rates, survey_sizes, strict=True), start=1):
        outcomes = np.array([1] * round(rate * size) + [0] * (size - round(rate * size)))
        entity_rng.shuffle(outcomes)
        for idx in range(size):
            survey_rows.append(
                {
                    "respondent_id": f"HX-S{tier}-{idx + 1:03d}",
                    "tier": tier,
                    "adopted": int(outcomes[idx]),
                    "annual_ai_spend_cents": int((6 - tier) * 48_000_000 + entity_rng.normal(0, 5_000_000)),
                }
            )
    rows = _write_csv(case_root / "data/market_survey.csv", list(survey_rows[0]), survey_rows)
    artifacts.append(_artifact(case_root, "data/market_survey.csv", "helios.market-survey/v1", rows))
    market_assumptions = {
        "schema_version": "helios.market-assumptions/v1",
        "stage_probabilities": stage_probabilities,
        "universe_counts": [5000, 7500, 9500, 11000, 8000],
        "tier_mid_spend_cents": [240000000, 192000000, 144000000, 96000000, 48000000],
        "adoption_prior": "Beta(1,1)",
        "credible_interval": "90%"
    }
    write_json(case_root / "data/market_assumptions.json", market_assumptions)
    artifacts.append(_artifact(case_root, "data/market_assumptions.json", "helios.market-assumptions/v1", 1))

    experiment_rows = helios_optimizer_fixture(seed)
    rows = _write_csv(case_root / "data/optimizer_experiment.csv", list(experiment_rows[0]), experiment_rows)
    artifacts.append(_artifact(case_root, "data/optimizer_experiment.csv", "helios.optimizer-experiment/v1", rows))

    cap_table = {
        "schema_version": "helios.capitalization/v2",
        "as_of": CUTOFF,
        "cash_at_cutoff_cents": cutoff_cash,
        "unissued_option_pool_shares": 1_400_000,
        "holders": [
            {"holder_id": "founders", "class_id": "COMMON", "issued_shares": 4_800_000},
            {"holder_id": "employees", "class_id": "COMMON", "issued_shares": 1_300_000},
            {"holder_id": "series-a-investor", "class_id": "SERIES_A", "issued_shares": 2_050_000},
            {"holder_id": "series-b-investor", "class_id": "SERIES_B", "issued_shares": 1_850_000},
        ],
        "preference_terms": [
            {
                "class_id": "SERIES_A", "seniority": 3,
                "invested_cents": 1_200_000_000, "preference_multiple": "1.00",
                "participation": "NON_PARTICIPATING", "participation_cap_multiple": None,
                "conversion_numerator": 1, "conversion_denominator": 1,
            },
            {
                "class_id": "SERIES_B", "seniority": 2,
                "invested_cents": 2_400_000_000, "preference_multiple": "1.00",
                "participation": "CAPPED_PARTICIPATING", "participation_cap_multiple": "2.00",
                "conversion_numerator": 1, "conversion_denominator": 1,
            },
        ],
        "reconciliation": {
            "issued_shares": 10_000_000,
            "fully_diluted_shares": 11_400_000,
            "residual_shares": 0,
        },
    }
    write_json(case_root / "data/cap_table.json", cap_table)
    artifacts.append(_artifact(case_root, "data/cap_table.json", "helios.capitalization/v2", 1))
    def projected_cash_path(start_use: int, monthly_improvement: int) -> list[int]:
        return [-(max(25_000_000, start_use - monthly_improvement * month)) for month in range(60)]

    def milestone_results(state: str) -> list[dict[str, str]]:
        if state == "PASS":
            states = ("PASS", "PASS", "PASS", "PASS")
        else:
            states = ("PASS", "PASS", "FAIL", "OPEN")
        return [
            {"metric_id": metric_id, "state": result_state}
            for metric_id, result_state in zip(
                (
                    "hx-nrr-metric",
                    "hx-margin-metric",
                    "hx-pipeline-audit",
                    "hx-optimizer-replication",
                ),
                states,
                strict=True,
            )
        ]

    financing_plan = {
        "schema_version": "helios.financing-plan/v2",
        "projection_origin": "2026-08-29",
        "target_holder_id": "series-c-investor",
        "option_pool_target": "0.12",
        "option_pool_refresh_borne_by": "PRE_MONEY_HOLDERS",
        "price_rounding": "FLOOR_WHOLE_SHARES_WITH_APIC_REMAINDER",
        "exit_value_basis": "EQUITY_VALUE",
        "milestone_contract": {
            "tranche_id": "series-c-tranche",
            "amount_cents": 1_500_000_000,
            "test_month": 12,
            "evaluator": "BOARD_FINANCE_COMMITTEE",
            "cure_period_days": 30,
            "release_rule": "ALL_TESTS_PASS_AFTER_CURE",
            "failure_consequence": "WITHHOLD_TRANCHE_AND_REUNDERWRITE_RUNWAY",
            "tests": [
                {"metric_id": "hx-nrr-metric", "period": "trailing_12_months", "operator": ">=", "threshold": "1.05", "evidence_locator": "hx-nrr"},
                {"metric_id": "hx-margin-metric", "period": "trailing_3_months", "operator": ">=", "threshold": "0.70", "evidence_locator": "hx-margin"},
                {"metric_id": "hx-pipeline-audit", "period": "as_of_test", "operator": "==", "threshold": "COMPLETE", "evidence_locator": "hx-pipeline"},
                {"metric_id": "hx-optimizer-replication", "period": "pre_tranche", "operator": "==", "threshold": "REPLICATED", "evidence_locator": "hx-optimizer"},
            ],
        },
        "scenario_books": [
            {
                "scenario_id": "BASE", "exit_month": 60, "exit_value_cents": 120_000_000_000,
                "monthly_net_cash_flow_cents": projected_cash_path(105_000_000, 700_000),
                "events": [
                    {"event_id": "series-c-close", "scheduled_month": 1, "sequence": 10, "event_type": "PRIMARY", "holder_id": "series-c-investor", "class_id": "SERIES_C", "new_money_cents": 2_500_000_000, "pre_money_cents": 16_000_000_000, "price_rule": "PRE_MONEY", "pool_target": "0.12", "milestone_state": "NOT_APPLICABLE", "funded": True, "seniority": 1},
                    {"event_id": "series-c-tranche", "scheduled_month": 12, "sequence": 20, "event_type": "MILESTONE", "holder_id": "series-c-investor", "class_id": "SERIES_C", "new_money_cents": 1_500_000_000, "pre_money_cents": None, "price_rule": "SAME_AS_SERIES_C", "pool_target": "0", "milestone_state": "FAIL", "milestone_results": milestone_results("FAIL"), "funded": False, "seniority": 1},
                    {"event_id": "series-d-base", "scheduled_month": 30, "sequence": 30, "event_type": "LATER_ROUND", "holder_id": "series-d-investor", "class_id": "SERIES_D", "new_money_cents": 2_000_000_000, "pre_money_cents": 45_000_000_000, "price_rule": "PRE_MONEY", "pool_target": "0", "milestone_state": "NOT_APPLICABLE", "funded": True, "seniority": 0},
                ],
            },
            {
                "scenario_id": "MILESTONE", "exit_month": 60, "exit_value_cents": 160_000_000_000,
                "monthly_net_cash_flow_cents": projected_cash_path(95_000_000, 850_000),
                "events": [
                    {"event_id": "series-c-close", "scheduled_month": 1, "sequence": 10, "event_type": "PRIMARY", "holder_id": "series-c-investor", "class_id": "SERIES_C", "new_money_cents": 2_500_000_000, "pre_money_cents": 16_000_000_000, "price_rule": "PRE_MONEY", "pool_target": "0.12", "milestone_state": "NOT_APPLICABLE", "funded": True, "seniority": 1},
                    {"event_id": "series-c-tranche", "scheduled_month": 12, "sequence": 20, "event_type": "MILESTONE", "holder_id": "series-c-investor", "class_id": "SERIES_C", "new_money_cents": 1_500_000_000, "pre_money_cents": None, "price_rule": "SAME_AS_SERIES_C", "pool_target": "0", "milestone_state": "PASS", "milestone_results": milestone_results("PASS"), "funded": True, "seniority": 1},
                ],
            },
            {
                "scenario_id": "DOWNSIDE", "exit_month": 60, "exit_value_cents": 35_000_000_000,
                "monthly_net_cash_flow_cents": projected_cash_path(125_000_000, 0),
                "events": [
                    {"event_id": "series-c-close", "scheduled_month": 1, "sequence": 10, "event_type": "PRIMARY", "holder_id": "series-c-investor", "class_id": "SERIES_C", "new_money_cents": 2_500_000_000, "pre_money_cents": 16_000_000_000, "price_rule": "PRE_MONEY", "pool_target": "0.12", "milestone_state": "NOT_APPLICABLE", "funded": True, "seniority": 1},
                    {"event_id": "series-c-tranche", "scheduled_month": 12, "sequence": 20, "event_type": "MILESTONE", "holder_id": "series-c-investor", "class_id": "SERIES_C", "new_money_cents": 1_500_000_000, "pre_money_cents": None, "price_rule": "SAME_AS_SERIES_C", "pool_target": "0", "milestone_state": "FAIL", "milestone_results": milestone_results("FAIL"), "funded": False, "seniority": 1},
                    {"event_id": "series-d-down", "scheduled_month": 18, "sequence": 30, "event_type": "LATER_ROUND", "holder_id": "series-d-investor", "class_id": "SERIES_D", "new_money_cents": 4_000_000_000, "pre_money_cents": 12_000_000_000, "price_rule": "PRE_MONEY", "pool_target": "0", "milestone_state": "NOT_APPLICABLE", "funded": True, "seniority": 0},
                ],
            },
            {
                "scenario_id": "FINANCING_SHORTFALL", "exit_month": 60, "exit_value_cents": 50_000_000_000,
                "monthly_net_cash_flow_cents": projected_cash_path(125_000_000, 0),
                "events": [
                    {"event_id": "series-c-close", "scheduled_month": 1, "sequence": 10, "event_type": "PRIMARY", "holder_id": "series-c-investor", "class_id": "SERIES_C", "new_money_cents": 2_500_000_000, "pre_money_cents": 16_000_000_000, "price_rule": "PRE_MONEY", "pool_target": "0.12", "milestone_state": "NOT_APPLICABLE", "funded": True, "seniority": 1},
                    {"event_id": "series-c-tranche", "scheduled_month": 12, "sequence": 20, "event_type": "MILESTONE", "holder_id": "series-c-investor", "class_id": "SERIES_C", "new_money_cents": 1_500_000_000, "pre_money_cents": None, "price_rule": "SAME_AS_SERIES_C", "pool_target": "0", "milestone_state": "FAIL", "milestone_results": milestone_results("FAIL"), "funded": False, "seniority": 1},
                    {"event_id": "series-c-bridge", "scheduled_month": 1, "sequence": 90, "event_type": "SHORTFALL", "holder_id": "bridge-investor", "class_id": "SERIES_BRIDGE", "new_money_cents": 3_500_000_000, "pre_money_cents": None, "price_rule": "DISCOUNT_TO_SERIES_C", "shortfall_discount": "0.25", "pool_target": "0", "milestone_state": "NOT_APPLICABLE", "funded": True, "seniority": 0},
                ],
            },
        ],
    }
    write_json(case_root / "data/financing_plan.json", financing_plan)
    artifacts.append(_artifact(case_root, "data/financing_plan.json", "helios.financing-plan/v2", 4))
    venture_scenarios = {
        "schema_version": "helios.venture-scenarios/v2",
        "draws": 1000,
        "distribution_seed_offset": 41,
        "exit_value_multiple_low": "0.05",
        "exit_value_multiple_high": "1.85",
        "path_method": "WEIGHTED_SCENARIO_STATE_PLUS_OPERATING_EXIT_AND_TIMING_FULL_ENGINE_REPLAY",
        "scenario_state_weights": {
            "MILESTONE": "0.45",
            "BASE": "0.30",
            "DOWNSIDE": "0.15",
            "FINANCING_SHORTFALL": "0.10",
        },
    }
    write_json(case_root / "data/venture_scenarios.json", venture_scenarios)
    artifacts.append(_artifact(case_root, "data/venture_scenarios.json", "helios.venture-scenarios/v2", 1))
    team_diligence = {
        "schema_version": "helios.team-diligence/v2",
        "roles": [
            {"role": "CEO / founder", "strength": "Product insight is supported by design-partner problem definition.", "gap": "Commercial dependence and succession remain open.", "required_reference": "Two lost prospects and two non-design-partner customers", "evidence_state": "OPEN", "financing_consequence": "No tranche release without repeatability evidence."},
            {"role": "CTO", "strength": "Optimizer experiment shows synthetic unit-cost improvement.", "gap": "Provider concentration and production replication remain open.", "required_reference": "Cloud-provider cost ledger and replication log", "evidence_state": "PARTIAL", "financing_consequence": "Optimizer effect receives no credit beyond the tested population."},
            {"role": "CRO / revenue", "strength": "Pipeline stage history exists at opportunity level.", "gap": "Ordinary-customer repeatability is not established.", "required_reference": "Reference calls and stage-to-close cohort export", "evidence_state": "OPEN", "financing_consequence": "Withhold milestone capital if pipeline governance is incomplete."},
            {"role": "Finance", "strength": "No dedicated capability is evidenced.", "gap": "Usage margin, runway, and financing controls need an accountable owner.", "required_reference": "Controller/CFO search plan and monthly close package", "evidence_state": "ABSENT", "financing_consequence": "Finance-lead hire is a closing condition."},
        ],
    }
    write_json(case_root / "data/team_diligence.json", team_diligence)
    artifacts.append(_artifact(case_root, "data/team_diligence.json", "helios.team-diligence/v2", 4))
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
        "pipeline_inflated_opportunity_ids": inflated_opportunity_ids,
        "pipeline_weighted_inflation_cents": str(pipeline_weighted_inflation_cents.quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)),
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
