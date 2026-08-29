# Underwriting Intelligence Lab econometrics contract

Status: `FROZEN BEFORE GENERATED CASE RESULTS`  
Contract version: `underwriting-econometrics/v1`  
Cutoff: `2026-08-31T23:59:59Z`

This contract fixes the data-generating processes, estimands, analytical
classes, diagnostics, recovery tolerances, and failure behavior before the
canonical AtlasGrid or Helios results are generated. A failed tolerance remains
a finding. It may be fixed only by repairing an implementation bug or issuing a
new contract version with new seeds; post-result tolerance widening is
prohibited.

## Shared generation and isolation

- Generation is a pure function of case ID, contract version, and a 128-bit
  master seed. Named random substreams prevent execution-order dependence.
- Money is stored as integer cents. Share counts and operational units are
  integers. Persisted rates and statistical results are quantized with
  `ROUND_HALF_EVEN` at their declared precision.
- Each output has two sibling trees: `case/` contains the runtime data room and
  manifest; `verification/truth/` contains generator parameters, planted
  distortion records, seed material, and oracle results.
- Runtime packages and the React workbench may not import, read, copy, or
  serialize anything from the truth tree. Verification tests are the only
  allowed consumers.
- The case manifest publishes a seed commitment, generator version, cutoff,
  artifact schemas, row counts, and SHA-256 digests, but not the seed.
- Same case and seed must reproduce canonical data-room bytes and digests.
  Different seeds must change the digest while preserving schemas, accounting
  identities, decision direction, and all planted-design invariants.
- The canonical seed plus two alternates must pass invariant and recovery
  tests. A byte scan must find no truth path, raw seed, or truth-only digest in
  the case tree or frontend bundle.

## Runtime and verification states

Runtime states are `REPORTED`, `DIAGNOSTIC_BLOCKED`, `ABSTAIN`, and
`NOT_APPLICABLE`. The v2 verification ledger uses `ESTIMATED`,
`INTERVAL_CONTAINS_TRUTH`, `ABSTENTION_CONFIRMED`, and `FAILED_RECOVERY`.
`FAILED_RECOVERY` is fail-closed and includes tolerance failures, malformed or
missing truth/intervals, and missed abstentions. This post-review taxonomy
clarification changes no frozen estimator or tolerance.

A material tolerance failure, missed abstention, unexplained accounting
residual, orphan operand, or stale upstream digest maps to `HOLD`. Runtime
analyses never receive truth values or recovery results.

## AtlasGrid Systems DGP

AtlasGrid is a fictional vertical B2B SaaS company spanning 60 monthly periods.
The generator creates approximately 1,600 customer entities mapped to parent
accounts, contracts, prices, recurring revenue, implementations, usage,
support, invoices, collections, credit memos, a monthly P&L, QoE bridge,
management forecast, debt schedule, covenants, a renewal-price experiment, and
a simultaneous pod-level support-automation assignment with pre/post periods.

The reporting layer plants six recoverable distortions:

1. signed-not-live and cancellable revenue included in booked ARR;
2. active-only retention excluding churned entities;
3. entity-level concentration that ignores common parents;
4. customer-success, credits, and implementation costs omitted from reported
   gross margin;
5. challenged or non-recurring add-backs in seller EBITDA;
6. forecast churn, NRR, and margin assumptions that exceed observable base
   rates while leverage and covenant headroom narrow in downside cases.

Required analyses and precommitments:

| ID | Method and class | Diagnostic / recovery rule |
|---|---|---|
| AG-01 | Customer ledger and ARR bridges — `ACCOUNTING_IDENTITY` | Revenue and ARR bridges close exactly to integer cents. Planted reporting residuals reconcile exactly. |
| AG-02 | Full-cohort versus active-only GRR/NRR — `DESCRIPTIVE` | Full-cohort micro-fixtures match exactly; canonical active-only NRR must exceed full-cohort NRR by at least 500 bps. |
| AG-03 | Parent versus entity concentration — `DESCRIPTIVE` | Parent roll-up is exact; canonical top-ten parent concentration exceeds entity view by at least 500 bps. |
| AG-04 | Gross-margin and QoE normalization — `ACCOUNTING_IDENTITY` | Reported-to-burdened margin and seller-to-normalized EBITDA bridges close exactly. |
| AG-05 | Discrete-time churn hazard — `PREDICTIVE_ASSOCIATION` | Event count at least 200; coefficients retain planted signs; implied annual churn is within 150 bps of generator truth. No causal language. |
| AG-06 | Naive realized-price association — `PREDICTIVE_ASSOCIATION` | The estimate must differ from the planted causal effect by more than three standard errors and carry the confounding limitation. |
| AG-07 | Randomized renewal pricing — `CAUSAL_SYNTHETIC_ONLY` | Treatment balance standardized differences below 0.15; ITT sign matches truth; 95% interval contains the planted effect. |
| AG-08 | Support-automation DiD — `CAUSAL_SYNTHETIC_ONLY` | Fixed cohort and month effects; cluster by pod; pretrend and fake-date placebo within the frozen gates; ATT sign matches truth and 95% interval contains it. Missing preperiods or inadequate clusters produce `NOT_IDENTIFIED`. |
| AG-09 | Customer-success-leader attribution — `NOT_IDENTIFIED` | Runtime must abstain because the hire overlaps price and macro changes with no valid control group. Any point estimate is `ABSTENTION_MISSED`. |
| AG-10 | Debt, covenants, and sponsor returns — `ACCOUNTING_IDENTITY` + `SCENARIO` | Debt schedule closes to cents. Ask misses a declared hurdle. Reprice clears 22% gross IRR and 2.0x MOIC. Downside never exceeds base. |
| AG-11 | Seeded returns distribution — `SCENARIO` | 20,000 draws; p10 ≤ p50 ≤ p90; byte-identical persisted results; probability bounds in [0,1]; no NaN. |

The illustrative human record is `REPRICE`. The machine proves only the inputs,
scenario outputs, decision-record completeness, and lineage.

## Helios Compute Control DGP

Helios is a fictional AI-infrastructure cost-control platform with monthly
customer usage, managed GPU spend, take-rate and platform revenue, compute and
support costs, quarterly cohorts, design partners, CRM stage history, a five-
tier market universe, a stratified survey, an optimizer experiment, monthly
cash burn, cap table, option pool, financing preferences, dilution scenarios,
and exit distributions.

The reporting layer plants design-partner selection bias, inflated pipeline
stages and close dates, and survivor-only comparable outcomes.

Required analyses and precommitments:

| ID | Method and class | Diagnostic / recovery rule |
|---|---|---|
| HX-01 | Usage, take-rate revenue, cash, and gross-margin bridge — `ACCOUNTING_IDENTITY` | Monthly identities close exactly to cents. |
| HX-02 | Cohort expansion and design-partner selection — `DESCRIPTIVE` | Cohort tables close; pooled NRR must exceed non-design-partner NRR by at least 400 bps. |
| HX-03 | CAC, payback, burn multiple, and runway — `ACCOUNTING_IDENTITY` | Micro-fixtures and generated totals recompute exactly at declared precision. |
| HX-04 | Pipeline integrity — `DESCRIPTIVE` | Inflated-deal roster and weighted-pipeline residual match the planted set and cents exactly; denominators below 15 report insufficient history. |
| HX-05 | Bayesian tiered market sizing — `PREDICTIVE_ASSOCIATION` | Beta-binomial posterior by tier; intervals ordered; prior sensitivity shown; tiers 1–4 contain generator truth within the declared 90% interval; data-thin tier 5 returns `ABSTAIN`. |
| HX-06 | Randomized optimizer experiment — `CAUSAL_SYNTHETIC_ONLY` | The precommitted unadjusted ITT is primary and supplies any explicit economic mapping; baseline-adjusted OLS is a labeled precision companion only. Balance standardized differences below 0.15; primary effect sign matches truth; primary 95% interval contains the planted effect. |
| HX-07 | Total-spend-growth attribution — `NOT_IDENTIFIED` | Adoption follows spend spikes and violates parallel trends; runtime must abstain. Any causal estimate is `ABSTENTION_MISSED`. |
| HX-08 | Cap-table dilution and preference waterfall — `ACCOUNTING_IDENTITY` | Integer shares and cents; class proceeds sum exactly to exit value; conversion and participation breakpoints are explicit. |
| HX-09 | New-money outcome distribution — `SCENARIO` | 20,000 draws; p10 ≤ p50 ≤ p90; loss and ≥3x probabilities in [0,1]; same seed repeats; scenario priors disclosed as assumptions. |

The illustrative human record is conditional `INVEST`. Entry price, ownership,
milestones, open verification conditions, failure consequences, and falsifiers
must be explicit. Scenario priors are inputs, not knowledge or forecasts.

## Statistical and reporting rules

- Estimands, populations, periods, methods, classifications, assumptions,
  diagnostics, uncertainty, input digests, and rerun receipts are mandatory.
- Statistical computation may use established numerical libraries; persisted
  results are quantized and tolerance-tested rather than falsely claimed to be
  bit-identical across BLAS implementations.
- Accounting and canonical manifests remain byte deterministic.
- No estimator may choose its estimand, controls, cutoff, tolerance, or
  assignment design after seeing the canonical result.
- A model-written narrative cannot alter numeric results, analytical classes,
  receipts, or decision authority.
- Synthetic-only causal results are software/design recovery evidence, not
  evidence of real-company causality or investment performance.
