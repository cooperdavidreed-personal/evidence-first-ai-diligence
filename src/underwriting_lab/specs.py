from __future__ import annotations

from typing import Any

from .contracts import CUTOFF, digest


CASE_ANALYSES = {
    "atlasgrid": ("AG-01", "AG-02", "AG-03", "AG-04", "AG-05", "AG-06", "AG-07", "AG-08", "AG-09", "AG-10", "AG-11"),
    "helios": ("HX-01", "HX-02", "HX-03", "HX-04", "HX-05", "HX-06", "HX-07", "HX-08", "HX-09"),
}

METHOD_FAMILIES = {
    "AG-01": "integer-cent accounting bridge", "AG-02": "fixed-cohort retention bridge", "AG-03": "mapped-parent concentration", "AG-04": "QoE normalization", "AG-05": "discrete hazard and Kaplan-Meier", "AG-06": "observational linear probability model", "AG-07": "randomized intention-to-treat", "AG-08": "collapsed pod-delta difference-in-differences", "AG-09": "identification abstention", "AG-10": "deterministic sponsor return bridge", "AG-11": "seeded scenario simulation",
    "HX-01": "integer-cent usage economics bridge", "HX-02": "fixed-cohort selection audit", "HX-03": "cash runway and burn bridge", "HX-04": "stage-history reconstruction", "HX-05": "tiered beta-binomial model", "HX-06": "randomized intention-to-treat", "HX-07": "identification abstention", "HX-08": "integer-share ownership bridge", "HX-09": "class-aware preference waterfall simulation",
}

RECOVERY_RULES = {
    "AG-05": "annualized churn within 150 basis points of planted target",
    "AG-06": "offer-scale association and randomized ITT are finite on the same unit scale with a positive first stage",
    "AG-07": "precommitted 95 percent interval contains planted price effect",
    "AG-08": "both precommitted 95 percent intervals contain planted effects and diagnostics pass",
    "AG-09": "analysis abstains",
    "HX-04": "eligible stage-history inflation count matches planted identifiers",
    "HX-05": "tier 1 through 4 intervals contain planted adoption rates and tier 5 abstains",
    "HX-06": "precommitted 95 percent interval contains planted optimizer effect",
    "HX-07": "analysis abstains",
}


STUDY_DESIGNS: dict[str, dict[str, Any]] = {
    "AG-01": {"outcome": "recognized_revenue_cents and live_arr_cents", "treatment_or_exposure": "NOT_APPLICABLE", "population": "all eligible synthetic invoices, contracts, and customer-month records", "period": "LTM ending at cutoff", "estimand": "exact invoice-to-revenue and booked-to-live ARR reconciliation deltas", "unit": "integer_cents", "assignment_or_design": "ACCOUNTING_CENSUS", "uncertainty_method": "EXACT_IDENTITY", "required_diagnostics": ["revenue_reconciliation", "arr_reconciliation", "post_cutoff_exclusion"], "permitted_use": "DIRECT_MODEL_INPUT"},
    "AG-02": {"outcome": "retained_arr_cents", "treatment_or_exposure": "base_cohort_membership", "population": "customers live at the frozen cohort start including churned customers at zero", "period": "cohort start through cutoff", "estimand": "full-cohort GRR and NRR and active-only NRR gap", "unit": "percent", "assignment_or_design": "DESCRIPTIVE_CENSUS", "uncertainty_method": "NOT_APPLICABLE", "required_diagnostics": ["cohort_closure", "active_only_gap_bps"], "permitted_use": "RETENTION_ANCHOR"},
    "AG-03": {"outcome": "arr_cents_by_legal_parent", "treatment_or_exposure": "legal_parent_mapping", "population": "all live customer entities at cutoff", "period": "cutoff month", "estimand": "top-ten legal-parent ARR share and entity-reporting gap", "unit": "percent", "assignment_or_design": "DESCRIPTIVE_CENSUS", "uncertainty_method": "NOT_APPLICABLE", "required_diagnostics": ["mapping_completeness", "parent_entity_gap_bps"], "permitted_use": "CONCENTRATION_RISK_AND_TERMS"},
    "AG-04": {"outcome": "normalized_ebitda_cents", "treatment_or_exposure": "seller_adjustments and fully_burdened_cogs", "population": "LTM P&L and complete QoE schedule", "period": "LTM ending at cutoff", "estimand": "exact normalized EBITDA and fully burdened gross margin bridge", "unit": "integer_cents", "assignment_or_design": "ACCOUNTING_IDENTITY", "uncertainty_method": "EXACT_IDENTITY", "required_diagnostics": ["pnl_reconciliation", "qoe_reconciliation"], "permitted_use": "SPONSOR_LENDER_PRICE_BRIDGE"},
    "AG-05": {"outcome": "monthly logo churn event", "treatment_or_exposure": "active customer-month exposure", "population": "all eligible customer-months through cutoff", "period": "months 1 through 60", "estimand": "monthly event-over-exposure hazard and KM survival at months 12, 36, and 60", "unit": "probability", "assignment_or_design": "PREDICTIVE_DISCRETE_HAZARD", "uncertainty_method": "GREENWOOD_AND_CLUSTER_CAVEAT", "required_diagnostics": ["event_count", "active_month_exposure", "stationarity_caveat"], "permitted_use": "CHURN_SCENARIO_ANCHOR_ONLY"},
    "AG-06": {"outcome": "renewal_indicator", "treatment_or_exposure": "realized_price_change_percentage_points", "population": "eligible synthetic renewal observations", "period": "frozen renewal experiment window", "estimand": "OLS renewal slope times offer-to-control first-stage price difference, on the AG-07 offer scale", "unit": "percentage_points", "assignment_or_design": "OBSERVATIONAL_POST_TREATMENT_EXPOSURE", "uncertainty_method": "OLS_DELTA_METHOD", "required_diagnostics": ["standard_error", "first_stage", "implied_offer_scale_interval"], "permitted_use": "CONFOUNDING_EXHIBIT_ZERO_MODEL_CREDIT"},
    "AG-07": {"outcome": "renewal_indicator", "treatment_or_exposure": "renewal_price_offer_assignment", "population": "all eligible synthetic renewal observations", "period": "frozen renewal experiment window", "estimand": "intention-to-treat difference in renewal probability", "unit": "percentage_points", "assignment_or_design": "SEEDED_BERNOULLI_ASSIGNMENT", "uncertainty_method": "NEYMAN_95_PERCENT_INTERVAL", "required_diagnostics": ["assignment_mechanism", "treatment_count", "control_count", "risk_score_smd"], "permitted_use": "PRICING_LEVER_RANGE"},
    "AG-08": {"outcome": "pod resolution hours and gross churn bps pre-post delta", "treatment_or_exposure": "support_automation_assignment", "population": "40 synthetic support pods", "period": "declared pre and post windows", "estimand": "treated-minus-control difference in pod-level pre-post deltas", "unit": "hours_and_basis_points", "assignment_or_design": "SEEDED_PERMUTATION_20_OF_40", "uncertainty_method": "POD_DELTA_TWO_SAMPLE_95_PERCENT_INTERVAL", "required_diagnostics": ["assignment_mechanism", "pretrend_slope_gap", "fake_date_placebo_hours"], "permitted_use": "SUPPORT_AUTOMATION_LEVER_RANGE"},
    "AG-09": {"outcome": "NOT_IDENTIFIED", "treatment_or_exposure": "overlapping leadership and commercial interventions", "population": "synthetic event window", "period": "overlapping intervention period", "estimand": "NO_CAUSAL_ESTIMAND", "unit": "not_applicable", "assignment_or_design": "IDENTIFICATION_ABSTENTION", "uncertainty_method": "NOT_APPLICABLE", "required_diagnostics": ["overlapping_events"], "permitted_use": "ZERO_MODEL_CREDIT"},
    "AG-10": {"outcome": "sponsor dated cash flows, MOIC, XIRR, debt, liquidity, and covenant headroom", "treatment_or_exposure": "declared transaction and operating scenario", "population": "synthetic AtlasGrid transaction", "period": "close through month 60", "estimand": "exact recomputed transaction economics for one declared scenario", "unit": "integer_cents_and_rates", "assignment_or_design": "ACCOUNTING_AND_SCENARIO_ENGINE", "uncertainty_method": "EXACT_RECONCILIATION", "required_diagnostics": ["sources_equal_uses", "cash_rollforward", "debt_rollforward", "xirr_npv_residual"], "permitted_use": "DECISION_CONDITIONS"},
    "AG-11": {"outcome": "conditional sponsor MOIC and XIRR", "treatment_or_exposure": "declared correlated operating-driver draws", "population": "conditional synthetic scenario paths", "period": "close through month 60", "estimand": "conditional return distribution from fully recomputed operating and debt paths", "unit": "multiple_and_percent", "assignment_or_design": "SEEDED_SCENARIO_SIMULATION", "uncertainty_method": "DECLARED_QUANTILES_AND_TAIL_PROBABILITIES", "required_diagnostics": ["path_reconciliation", "ordered_quantiles", "correlation_digest"], "permitted_use": "DOWNSIDE_RANGE_NOT_FORECAST"},
    "HX-01": {"outcome": "revenue_cents component_cogs_cents gross_margin and cash", "treatment_or_exposure": "NOT_APPLICABLE", "population": "all eligible usage and LTM P&L records", "period": "LTM ending at cutoff", "estimand": "exact usage-economics and gross-margin identities", "unit": "integer_cents", "assignment_or_design": "ACCOUNTING_CENSUS", "uncertainty_method": "EXACT_IDENTITY", "required_diagnostics": ["pnl_reconciliation", "component_cogs_reconciliation"], "permitted_use": "MARGIN_AND_RUNWAY_ANCHOR"},
    "HX-02": {"outcome": "retained_revenue_cents", "treatment_or_exposure": "design_partner_flag", "population": "frozen customer cohort including churn at zero", "period": "cohort start through cutoff", "estimand": "pooled and ordinary-customer NRR and design-partner gap", "unit": "percent", "assignment_or_design": "DESCRIPTIVE_CENSUS", "uncertainty_method": "NOT_APPLICABLE", "required_diagnostics": ["cohort_closure", "design_partner_gap_bps"], "permitted_use": "MILESTONE_THRESHOLD_ANCHOR"},
    "HX-03": {"outcome": "monthly ending_cash_cents and first cash-negative month", "treatment_or_exposure": "declared financing events", "population": "synthetic monthly cash ledger", "period": "cutoff through financing horizon", "estimand": "exact burn multiple and first cash-negative month under each event path", "unit": "integer_cents_and_month", "assignment_or_design": "ACCOUNTING_IDENTITY", "uncertainty_method": "EXACT_RECONCILIATION", "required_diagnostics": ["cash_rollforward", "capitalization_reconciliation"], "permitted_use": "FINANCING_TRIGGER"},
    "HX-04": {"outcome": "eligible stage and probability-weighted pipeline cents", "treatment_or_exposure": "latest eligible stage history", "population": "all synthetic opportunities at cutoff", "period": "stage history through cutoff", "estimand": "inflated opportunity count and weighted residual cents", "unit": "count_and_integer_cents", "assignment_or_design": "DESCRIPTIVE_RECONSTRUCTION", "uncertainty_method": "EXACT_ROSTER_AND_CENTS", "required_diagnostics": ["eligible_history_completeness", "post_cutoff_exclusion"], "permitted_use": "PIPELINE_GOVERNANCE_CONDITION"},
    "HX-05": {"outcome": "tier_adoption_indicator", "treatment_or_exposure": "market_tier", "population": "stratified synthetic market survey", "period": "survey at cutoff", "estimand": "tier-specific Beta posterior adoption rate and 90 percent credible interval", "unit": "probability", "assignment_or_design": "STRATIFIED_SYNTHETIC_SURVEY", "uncertainty_method": "BETA_POSTERIOR_90_PERCENT_CREDIBLE_INTERVAL", "required_diagnostics": ["prior_sensitivity", "interval_ordering", "thin_tier_abstention"], "permitted_use": "ASSUMPTION_DEPENDENT_MARKET_SCENARIO"},
    "HX-06": {"outcome": "change_in_log_unit_cost", "treatment_or_exposure": "optimizer_assignment", "population": "120 eligible synthetic accounts", "period": "declared experiment window", "estimand": "primary unadjusted intention-to-treat difference in change in log unit cost; baseline-adjusted OLS is a precision companion only", "unit": "log_points", "assignment_or_design": "SEEDED_PERMUTATION_60_OF_120", "uncertainty_method": "PRIMARY_NEYMAN_95_PERCENT_INTERVAL; COMPANION_OLS_HOMOSKEDASTIC_95_PERCENT_INTERVAL", "required_diagnostics": ["assignment_mechanism", "treatment_count", "control_count", "baseline_cost_smd"], "permitted_use": "PRIMARY_UNADJUSTED_ITT_FOR_MAPPED_COST_OR_SAVINGS_MILESTONE_ONLY"},
    "HX-07": {"outcome": "NOT_IDENTIFIED", "treatment_or_exposure": "adoption timing", "population": "synthetic adoption and spend panel", "period": "nonparallel trend window", "estimand": "NO_CAUSAL_ESTIMAND", "unit": "not_applicable", "assignment_or_design": "IDENTIFICATION_ABSTENTION", "uncertainty_method": "NOT_APPLICABLE", "required_diagnostics": ["nonparallel_pretrends"], "permitted_use": "ZERO_MODEL_CREDIT"},
    "HX-08": {"outcome": "shares ownership and cash by financing event", "treatment_or_exposure": "typed financing terms", "population": "all explicit holders classes pools and financing events", "period": "pre-Series-C through exit", "estimand": "exact integer-share capitalization after every event", "unit": "integer_shares_and_cents", "assignment_or_design": "ACCOUNTING_IDENTITY", "uncertainty_method": "EXACT_RECONCILIATION", "required_diagnostics": ["share_reconciliation", "ownership_reconciliation", "cash_reconciliation"], "permitted_use": "TERMS_INPUT"},
    "HX-09": {"outcome": "per-class proceeds MOIC and dated IRR", "treatment_or_exposure": "declared financing and exit scenario", "population": "explicit preferred and common classes", "period": "Series C close through exit", "estimand": "exact per-class returns over recomputed financing and waterfall paths", "unit": "integer_cents_multiple_and_percent", "assignment_or_design": "SCENARIO_ENGINE_WITH_EXACT_WATERFALL", "uncertainty_method": "EXACT_CONSERVATION_AND_ORDERED_SUMMARIES", "required_diagnostics": ["waterfall_conservation", "conversion_profile_uniqueness", "xirr_npv_residual"], "permitted_use": "CONDITIONAL_OUTCOME_NOT_FORECAST"},
}


def analysis_specs(case_id: str) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for analysis_id in CASE_ANALYSES[case_id]:
        spec: dict[str, Any] = {
            "schema_version": "underwriting.analysis-spec/v2",
            "analysis_id": analysis_id,
            "cutoff": CUTOFF,
            "tolerance_policy": "frozen_in_econometrics_contract",
            "state_policy": "diagnostic_roles_determine_blocking_and_accepted_abstention",
            "method_family": METHOD_FAMILIES[analysis_id],
            "recovery_rule": RECOVERY_RULES.get(analysis_id, "deterministic reconciliation or declared diagnostic state"),
            "design": STUDY_DESIGNS[analysis_id],
        }
        spec["spec_sha256"] = digest(spec)
        specs.append(spec)
    return specs
