# Underwriting Intelligence Lab v2 model-integrity contract

Status: `FROZEN BEFORE V2 ENGINE RESULTS`
Mission: `underwriting-intelligence-lab-v2-20260829`
Base: `7b1d0238fd7f71901fd807c01b619395c4efee73`

## Scope and compatibility

This contract supersedes the v1 underwriting implementation where the two
conflict. It does not change the `ic_evidence_lab` public interfaces. V1
underwriting payloads remain migratable, while fixed-seed determinism is
defined within v2 because v2 schemas and calculations necessarily change
digests.

AtlasGrid and Helios remain fictional. The default AtlasGrid calibration is
deliberately selected and disclosed to demonstrate an asking-price miss and a
solver-derived reprice or earnout that clears the declared hurdle. This is a
synthetic teaching design, not evidence that a real deal would produce the
same outcome.

## Verified stop-ship defects at the accepted v1 base

| ID | Severity | Verified defect | Required repair | Deterministic gate |
|---|---|---|---|---|
| MI-01 | S0 | AtlasGrid exit debt and return are assumptions rather than outputs of cash generation. | Cash-flow-driven operating, debt, covenant, and dated-return engine. | Sources/uses, cash, debt, covenants, equity, MOIC, and IRR independently reconcile. |
| MI-02 | S0 | Covenant breach is trusted from a stored CSV status string. | Recompute status from typed debt and lender-EBITDA operands. | Stored status is absent; mutated leverage is detected. |
| MI-03 | S0 | Helios milestone, base, and downside are p90, p50, and p10 labels over one distribution. | Distinct financing-event scenarios. | Different assumptions and digests recompute funding, runway, ownership, and returns. |
| MI-04 | S0 | Helios has no dated IRR. | Dated investor cash flows and XIRR. | Independent rate oracle matches. |
| MI-05 | S0 | AG-06 price slope and AG-07 offer ITT are compared in different units. | Bridge the slope through the randomized first stage or do not compare. | Pairing rejects estimand or unit mismatch. |
| MI-06 | S0 | AG-08 and HX-06 assign the first N units while claiming seeded randomization. | Reproducible seed-permutation assignment. | Repeated seeds change treated IDs while preserving balance and count. |
| MI-07 | S0 | Analysis specs hash placeholder estimands. | Exact per-study specifications. | Schema and lint reject placeholders. |
| MI-08 | S0 | Correct abstentions make readiness structurally unreachable. | Typed accepted abstention and decision-critical blocker. | Exhaustive state-machine tests reach every legal state. |
| MI-09 | S1 | Pending signature, open conditions, and analytical blockage are conflated. | Separate analytical disposition, human adjudication, and sealing. | Unsigned can reach adjudication but never sealed. |
| MI-10 | S0 | Waterfall uses floats and hard-coded class behavior. | Typed preference stack and exact integer allocation. | Independent breakpoint oracle and exact conservation. |
| MI-11 | S0 | Six recovery runs are presented with coverage-like prominence. | Rename as smoke recovery and add estimator-specific coverage simulation. | Frozen coverage bands over at least 500 simulations. |
| MI-12 | S1 | Underwriting artifacts are not checked against the cutoff. | Plant and exclude post-cutoff evidence. | Exclusion receipt plus complete temporal scan. |
| MI-13 | S1 | Only selected assumptions reach the graph and constants can borrow unrelated lineage. | Bind all operands and assumptions to formulas. | Zero orphan operands, assumptions, constants, or downstream nodes. |
| MI-14 | S1 | Frontend trusts cast JSON and parses formatted strings. | Validate v2 payload and use typed decimal strings. | Invalid payload renders a blocking error; no `parseFloat` finance path. |
| MI-15 | S1 | Promised stale propagation is absent. | Dependency-digest comparison and transitive stale state. | Mutated source marks every affected metric and decision stale until recompute. |
| MI-16 | S1 | Some standard-error labels differ from the frozen estimator. | Exact estimator/receipt-method conformance. | Doc-to-receipt method test. |
| MI-17 | S1 | Some tests assert source-literal PASS diagnostics. | Tests recompute identities from source artifacts. | Declared arithmetic mutants are killed. |
| MI-18 | S1 | “Inside 18 months” is evaluated on an annual grid as up to year 2. | Monthly debt/covenant grid or a correctly labeled period. | Boundary fixtures at months 18 and 19. |
| MI-19 | S1 | UI verification status is a product-surface constant. | Derive local state from a canonical acceptance receipt. | Status changes only when receipt digest and gates change. |
| MI-20 | S2 | Clean verification assumes an already populated Python environment. | Materialize frozen declared extras inside the verifier. | Clean-environment verifier passes without prior `.venv`. |

## V2 typed analytical core

### Typed value

Every displayed or intermediate value uses `underwriting.value/v2`:

```json
{
  "kind": "money|ratio|rate|count|shares|multiple|duration",
  "value": "decimal string",
  "unit": "cents|percent|bps|x|months|shares",
  "currency": "USD when kind=money",
  "period": {"as_of": "ISO-8601 date"},
  "quantum": "declared rounding grain"
}
```

Money uses integer cents in Python and decimal strings or `bigint` at the
TypeScript boundary. Shares are integers. Rates use `Decimal`. Floating point
is allowed only inside statistical simulation; persisted money is quantized
once at the output boundary with `ROUND_HALF_EVEN` and a recorded quantum.

### Metric and formula

Every rendered number uses a stable `metric_id` and binds:

- label, analytical classification, period, and typed value;
- `formula_id` from a small arithmetic formula registry;
- every operand, including artifact field, another metric, or assumption;
- every assumption and source;
- analysis specification and uncertainty where applicable; and
- downstream metrics, decision conditions, and initiatives.

The formula registry permits only declared arithmetic identities. Iterative
engines such as XIRR, max-bid search, cash sweeps, and waterfall elections are
canonical Python engine functions rather than being forced into the formula
AST. Their receipts bind every input assumption and output metric. The
frontend recomputes a declared sample of simple sources-and-uses, ownership,
cash, and conservation identities at load. A metric cannot render when its
declared identity operands fail to recompute exactly at the stated quantum.

### Scenario and sensitivity

A scenario is a named assumption set and a full engine recomputation:

```json
{
  "scenario_id": "stable slug",
  "kind": "ASK|REPRICE|EARNOUT|BASE|MILESTONE|DOWNSIDE|FINANCING_SHORTFALL",
  "derivation": "RECOMPUTED",
  "assumptions": [],
  "results": [],
  "engine_inputs_sha256": "...",
  "scenario_sha256": "..."
}
```

Distribution quantiles are separate and cannot serve as scenario results.
Every sensitivity cell is a complete scenario recomputation with its own
receipt. Declared monotonicity expectations are tested.

### Cash flow, debt, capitalization, and waterfall

- Cash-flow bridges reconcile revenue, EBITDA, interest, taxes, capex,
  working capital, free cash flow, amortization, sweep, cash, and debt by
  period.
- Debt schedules operate by tranche and recompute covenant status from typed
  operands at analysis time.
- Capitalization records append dated financing events, explicit classes,
  integer shares, prices, and ownership.
- Preference terms are typed by class: seniority, invested preference,
  multiple, participation, cap, and conversion ratio.
- Waterfall allocation is exact integer cents using largest-remainder splits.
  Conversion profiles are compared across all classes and checked against an
  independent enumerating oracle at every breakpoint plus and minus one cent.

### Decision dependencies

Diagnostics carry one of three decision roles:

- `GENERATOR_INVARIANT`: a software or synthetic-room invariant; failure makes
  the analytical package invalid rather than expressing an investment view;
- `IDENTIFICATION_BOUNDARY`: an expected limitation or accepted abstention;
  it receives zero model credit unless a human enters a visible scenario; and
- `DECISION_CRITICAL`: a failed or missing fact on which a material decision
  condition depends.

Analytical disposition is separate from human signature:

```text
BLOCKED_EVIDENCE
  failed generator invariant, stale dependency, or decision-critical blocker

HOLD_OPEN_CONDITIONS
  no analytical blocker and at least one material condition open

READY_FOR_ADJUDICATION
  no blocker; every material condition cleared or explicitly waived;
  signature pending

SEALED
  signed human decision record
```

An `ACCEPTED_ABSTENTION` marks a successfully enforced identification boundary
and does not block unless a decision condition explicitly depends on the
unidentified quantity. A `DECISION_CRITICAL_BLOCKER` does block. Generator
materiality findings do not become investment blockers unless separately bound
to a decision condition. `HOLD_OPEN_CONDITIONS` is a legal, human-adjudicable
conditional posture; it is not analytically complete and cannot be sealed.
Unsigned records never become `SEALED`. Frontend types and chrome must admit
all four states and may not hard-code a single workflow disposition.

### Staleness

Each metric stores its upstream digest set. Any mismatch marks it `STALE` and
propagates transitively through scenario, decision, and initiative edges.
Recomputation is the only operation that clears staleness.

## Exact econometric specifications

All fields below, plus assumptions and thresholds, are hashed before results.
The v2 schema requires structured outcome, treatment or exposure, population,
period, estimand expression, unit, assignment or design, uncertainty method,
diagnostics, and permitted-use mapping. Prose in this document cannot
substitute for those machine-readable fields.

### AtlasGrid

| ID | Exact estimand / output | Assignment or design | Uncertainty and gate | Permitted investment use |
|---|---|---|---|---|
| AG-01 | Invoice-to-revenue and booked-to-live ARR reconciliation deltas in cents. | Accounting census. | Exact identities. | Direct model inputs. |
| AG-02 | Frozen full-cohort GRR and NRR including churned accounts at zero. | Descriptive census. | Active-only gap at least 500 bps in the synthetic default. | Retention anchor. |
| AG-03 | Top-10 parent share under the frozen legal-parent map. | Descriptive census. | Parent/entity gap at least 1,500 bps in the synthetic default; decision materiality remains separately priced. | Concentration risk and term input. |
| AG-04 | Normalized EBITDA as the exact QoE bridge and P&L recomputation. | Accounting identity. | Integer equality. | Sponsor, lender, and price-definition bridge. |
| AG-05 | Monthly event/exposure logo hazard and KM survival at 12/36/60 months. | Predictive association; stationarity declared. | Event denominator, customer-dependence caveat, recovery tolerance. | Churn assumption anchor, not causal credit. |
| AG-06 | OLS slope of renewal on realized price; first stage `E[realized price change | offer] - E[realized price change | control]`; and implied offer-scale association equal to slope times first stage. | Observational, post-treatment exposure. | OLS and delta-method uncertainty; only the implied offer-scale association may be contrasted with AG-07 ITT. | Confounding exhibit; zero direct model credit. |
| AG-07 | ITT of randomized renewal-price offer on renewal probability. | Seeded Bernoulli assignment. | Neyman interval; balance SMD <= 0.15. | Pricing-lever range. |
| AG-08 | Treated-minus-control difference in pod-level pre/post deltas for resolution hours and churn bps. | Seed-permuted 20-of-40 pod assignment. | Collapsed pod-delta two-sample estimator, which explicitly supersedes the v1 two-way-fixed-effect wording; placebo and pretrend gates. | Support-automation lever range. |
| AG-09 | No causal estimand. | Overlapping interventions without control. | Required accepted abstention. | Zero base-case credit. |
| AG-10 | Cash-flow, debt, covenant, price, and sponsor-return outputs. | Accounting and scenario engine. | Exact reconciliation and declared hurdles. | Decision conditions. |
| AG-11 | Conditional IRR/MOIC distribution from fully recomputed operating and debt paths. | Declared scenario priors. | Path identities, ordered quantiles, disclosed correlations. | Downside range, never forecast truth. |

### Helios

| ID | Exact estimand / output | Assignment or design | Uncertainty and gate | Permitted investment use |
|---|---|---|---|---|
| HX-01 | LTM revenue, component COGS, gross margin, and cash identities. | Accounting census. | Exact cents. | Margin and runway anchors. |
| HX-02 | Pooled and ordinary-customer frozen-cohort NRR. | Descriptive census with frozen design-partner flag. | Cohort closure; default synthetic gap at least 400 bps. | Milestone threshold anchor. |
| HX-03 | Burn multiple and runway from exact cash roll-forward. | Accounting identity. | Cash equals capitalization and financing events. | Financing trigger. |
| HX-04 | Eligible stage-history inflation count and weighted residual cents. | Descriptive reconstruction. | Exact roster and cents. | Pipeline-governance condition subject to materiality. |
| HX-05 | Tier-specific Beta posterior adoption rate and 90% credible interval; n<10 abstains. | Stratified synthetic survey. | Prior sensitivity, ordered interval, canonical planted-truth recovery, and thin-tier abstention; no frequentist coverage claim. | Assumption-dependent market scenario only. |
| HX-06 | Primary unadjusted ITT of optimizer assignment on change in log unit cost; baseline-adjusted OLS is a precision companion only. | Seed-permuted 60-of-120 assignment. | Primary Neyman interval; companion homoskedastic OLS interval; balance SMD <= 0.15. | Only the precommitted unadjusted ITT may feed the explicit cost or customer-savings mapping. |
| HX-07 | No causal estimand. | Nonparallel adoption and spend trends. | Required accepted abstention. | Zero base-case credit. |
| HX-08 | Exact shares, ownership, and financing-event capitalization. | Accounting identity. | Integer reconciliation. | Terms input. |
| HX-09 | Per-class proceeds, MOIC, and dated IRR over recomputed financing and waterfall paths. | Declared scenario priors. | Exact conservation per draw and ordered summaries. | Conditional outcomes, never forecast truth. |

## Evidence-to-engine bindings

The engine may not merely describe analyses as anchors. Each permitted mapping
is hash-bound:

- starting normalized EBITDA equals AG-04 exactly;
- starting ARR and revenue equal the reconciled AG-01 values;
- base retention begins from AG-02 full-cohort NRR, never active-only NRR;
- parent concentration from AG-03 affects the declared customer-risk case or
  term solver, with the dollar impact rendered;
- AG-05 may anchor scenario churn but receives no causal treatment credit;
- AG-07 pricing and AG-08 support effects enter only through declared mapping
  formulas with uncertainty ranges;
- AG-09 and HX-07 have explicit zero-credit edges;
- Helios starting revenue/margin/cash equal HX-01/HX-03, ordinary NRR begins
  from HX-02, and every milestone uses a named metric and period.

Changing any bound evidence metric changes the engine-input digest and every
affected downstream result. A value without a bound mapping is an explicit
human assumption, not evidence.

## AtlasGrid PE engine

The synthetic default uses monthly operations and debt, summarized annually.

1. The target is sold cash-free and debt-free with normalized working capital
   delivered at a declared peg; the default peg adjustment is zero. Closing
   uses are cash EV consideration, transaction fees, financing fees, minimum
   cash funding, and any funded earnout reserve. Closing sources are sponsor
   equity, explicit seller rollover, and only debt cash actually funded at
   close, net of original-issue discount. An undrawn revolver commitment is
   liquidity capacity, not a closing source. Revolver face amount may enter
   closing sources only to the extent a separately declared closing draw funds
   a named use; the unused commitment is tracked off the sources-and-uses
   schedule. `sponsor equity = total uses - all non-sponsor sources`; both sides
   are independently recomputed rather than copied.
2. Operating schedules begin with frozen LTM revenue and normalized EBITDA and
   model ARR, revenue, gross profit, EBITDA, capex, working capital, taxes, and
   cash by scenario.
3. Each funded tranche declares opening principal, cash rate, PIK rate, OID,
   maturity, and mandatory amortization. The facility declares revolver
   commitment, any closing draw, minimum cash, one deal-level sweep percentage,
   and an explicit paydown priority. Tranche-level sweep percentages are
   schema-invalid because they make the same dollar of excess cash available
   more than once. The default convention uses monthly cash interest on each
   tranche's beginning funded principal; PIK capitalizes after mandatory
   amortization and before optional sweep. Revolver draw is allowed only to
   restore minimum cash within remaining commitment. Exit debt is therefore an
   output.

   For month `t`, all operands are integer cents and the following identities
   are mandatory. `EBITDA_t` is after all operating cash expenses.

   ```text
   taxable_income_t = max(0, EBITDA_t - cash_interest_t
                             - tax_depreciation_t
                             - deductible_fee_amortization_t)
   cash_taxes_t = taxable_income_t * declared_cash_tax_rate
   pre_debt_cash_t = beginning_cash_t + EBITDA_t - cash_taxes_t
                     - capex_t - delta_working_capital_t - cash_interest_t
   mandatory_amortization_t = sum(declared scheduled principal payments,
                                   capped at beginning funded principal)
   cash_after_mandatory_t = pre_debt_cash_t - mandatory_amortization_t
   revolver_draw_t = min(remaining_commitment_t,
                         max(0, minimum_cash_t - cash_after_mandatory_t))
   cash_before_sweep_t = cash_after_mandatory_t + revolver_draw_t
   sweep_pool_t = max(0, cash_before_sweep_t - minimum_cash_t)
                  * declared_sweep_percentage
   optional_sweep_t = sweep_pool_t allocated once in declared priority,
                      first to drawn revolver and then to eligible tranches,
                      each allocation capped at funded principal after
                      mandatory amortization plus current-period PIK
   ending_cash_t = cash_before_sweep_t - optional_sweep_t
   ending_principal_by_tranche_t = beginning_principal_t
                                   - mandatory_amortization_t
                                   + PIK_interest_t
                                   + revolver_draw_t
                                   - allocated_optional_sweep_t
   ```

   Tax depreciation, deductible fee amortization, tax rate, working-capital
   sign convention, mandatory-amortization dates, sweep percentage, and
   paydown priority are required typed assumptions; omission is
   `BLOCKED_EVIDENCE`, not zero by convenience. The reference engine recomputes
   each identity and proves total principal change equals draws plus PIK less
   repayments.
4. Reported EBITDA, AG-04 normalized sponsor EBITDA, and lender covenant EBITDA
   reconcile through a typed add-back schedule. The default leverage test uses
   gross funded debt—every funded term balance, current PIK, and drawn revolver,
   with no cash netting—divided by trailing-12-month lender EBITDA. Months 1–11
   use the hash-bound pre-close monthly history needed to form the trailing
   window; current-month or annualized EBITDA is forbidden. Any alternative
   cash-netting cap or EBITDA measurement period is a different, typed covenant
   structure and a full recomputation. Covenant headroom equals the declared
   maximum leverage multiple less recomputed gross leverage, monthly. The
   18-month falsifier is evaluated separately at months 18 and 19; no annual-grid
   substitute is permitted. Covenant breach is distinct from payment default,
   defined as unpaid scheduled cash interest or mandatory amortization, or
   ending cash below zero after drawing all available revolver capacity.
5. Gross-to-sponsor cash flows include sponsor entry equity, dated additional
   equity or earnout payments, any interim distributions, and exit proceeds.
   Transaction and financing fees paid by the acquisition vehicle are included;
   fund management fee and carried interest are excluded. MOIC and XIRR consume
   the same dated flows. Standard flows must have exactly one sign change;
   otherwise XIRR is `NOT_IDENTIFIED`. The oracle accepts an absolute NPV
   residual of at most one cent at the solved rate rather than an arbitrary
   rate-decimal tolerance.
6. Maximum bid is a one-dimensional monotone bisection over upfront cash EV
   while operating assumptions, debt quantum, and other terms remain fixed.
   Alternative debt, covenant, rollover, and earnout structures are separate
   full recomputations, not a five-dimensional optimization.
7. Value-creation levers are assumption-delta recomputations. The combined
   case reports interaction residuals so standalone values cannot be added
   twice.
8. Conditional simulations sample declared operating drivers and recompute the
   complete schedule. Exit debt, exit equity, MOIC, and IRR may not be sampled
   directly. Any sampled correlation structure is hash-bound and displayed.

### Earnout contract

The default earnout is contingent consideration, not a certain EV haircut:

- metric: verified live ARR at month 24 under the AG-01 definition;
- threshold and cap: explicit assumptions, with a default cap of `$20.00M`;
- payout: linear from zero at the threshold to the cap at 120% of threshold;
- payment date: month 25;
- funding: additional sponsor equity, not debt, unless a separately modeled
  source is declared; and
- downside: no payout when the threshold is not met.

The upfront-EV solver holds this earnout contract fixed. Every payout is a
dated sponsor outflow and affects MOIC and XIRR.

Frozen default hurdle:

- base gross sponsor IRR at least `22.00%`;
- base MOIC at least `2.00x`;
- asking price misses at least one of those two hurdles.

The asking-price case is allowed to breach the downside floor. The selected
structure may change upfront price, debt quantum, and/or covenant terms through
separate disclosed recomputations. Frozen downside floor for that selected
structure:

- gross sponsor IRR at least `5.00%`;
- MOIC at least `1.25x`;
- minimum liquidity at least `$3.00M`;
- no payment default; and
- no covenant breach in the modeled downside path.

## Helios VC engine

1. A dated event list records Series C, milestone tranche, bridge or shortfall
   financing, later rounds, and exit. Residual or scalar future dilution is
   forbidden; every diluted share belongs to an explicit holder or pool event.
2. Each event calculates price per share, integer new shares, option-pool
   refresh, explicit holder dilution, cash, and preference-stack changes. The
   default refresh targets 12% unissued post-money fully diluted ownership and
   is a pre-money pool shuffle borne by pre-event holders. With existing issued
   shares `E`, unissued pool `U`, top-up `T`, new preferred shares `N`, and
   target `q`, the exact integer solution satisfies
   `(U + T) / (E + U + T + N) >= q` with the smallest nonnegative `T`; `N` is
   computed from pre-money price per share using `E + U + T`. Unissued pool is
   included in financing fully diluted ownership but receives no exit proceeds
   unless options are explicitly exercised.
3. `BASE`, `MILESTONE`, `DOWNSIDE`, and `FINANCING_SHORTFALL` are distinct
   assumption sets and engine runs.
4. Every milestone declares amount, date, named metric tests and periods,
   evaluator, cure period, class, and price-per-share rule. Funded capital is
   included in that investor's MOIC denominator and dated cash flows; an
   unfunded tranche is not. `FINANCING_SHORTFALL` triggers when the monthly cash
   path exhausts before the next event and declares amount, seniority, discount,
   and price. Release or failure changes cash, runway, funding, shares,
   ownership, preferences, proceeds, MOIC, and dated IRR. Runway is the first
   month cash would fall below zero before the next event, not cash divided by
   recent burn.
5. Exact waterfall allocation uses typed terms and enumerates every preferred
   class's independent conversion election. A legal profile leaves no class
   strictly better off through unilateral conversion or reversion; equal
   proceeds default to non-conversion. Participating and capped-participating
   payoffs are calculated under the same seniority profile. Multiple legal
   profiles or no legal profile are a model error rather than an arbitrary
   global choice. Per-class proceeds sum to exit value exactly and match a
   separately structured brute-force oracle.
6. Conditional simulation replays financing events and exact waterfalls for
   every draw and includes exit timing.

## Verification contract

### Accounting and property tests

- At least 100 deterministic seeds for accounting invariants.
- At least 500 generated examples for waterfall and debt properties.
- Sources equal uses; cash and every tranche roll forward exactly.
- Shares and ownership reconcile after every financing event.
- Per-class proceeds are nonnegative, monotone in exit value, and sum exactly
  to exit value.
- Under the fixed-debt max-bid solver, lower entry price cannot reduce sponsor
  return. Under a declared pro-rata dilution event with no cancellations or
  pay-to-play, additional shares cannot increase existing-holder ownership.
  Under a fixed legal conversion profile, higher exit value cannot reduce any
  class's proceeds. Lower churn cannot reduce retained ARR.

### Independent oracles

- Debt schedule versus a separately structured exact-arithmetic reference.
- Waterfall versus brute-force conversion-profile enumeration at every
  breakpoint plus and minus one cent.
- XIRR versus a separately structured root solver with absolute NPV residual at
  or below one cent; irregular-date fixtures kill MOIC-CAGR substitution.

### Mutation gates

The suite must kill, at minimum: sweep sign reversal, amortization off by one
period, seniority swap, participation-cap removal, interest-balance convention
change, stored covenant-status trust, quantile-as-scenario reintroduction,
MOIC CAGR substituted for XIRR, hard-coded exit debt, first-N treatment
assignment, residual dilution scalar, global Series-C-only conversion choice,
earnout treated as a certain haircut, accepted-abstention-as-global-HOLD,
`parseFloat` on a finance path, and display-only sensitivity output. Lever and
sensitivity mutations must change AG-10 or HX-09 receipts, not merely UI state.

### State machine

Exhaustively enumerate diagnostic failure, stale dependency, blocker
abstention, accepted abstention, open/cleared/waived conditions, and
pending/signed signature. Every legal state must be reachable and illegal
transitions rejected.

### Estimator coverage

The existing six canonical runs are renamed `smoke-recovery`. A reduced-size
fixture uses unchanged estimator code for at least 500 independent seeds for
frequentist interval estimators AG-07, AG-08, and HX-06. Frozen acceptance
bands are:

- nominal 95% intervals: empirical coverage from `92%` through `98%`;
- no generic Bayesian coverage claim is made for HX-05. Its gates are declared
  prior sensitivity, interval ordering, canonical planted-truth recovery, and
  correct thin-tier abstention.

No public surface calls smoke recovery “coverage.”

### Isolation and temporal integrity

- Static import gate prevents runtime analytics from importing truth or
  verification modules.
- Behavioral gate removes the truth tree and requires the same runtime digest.
- Generators plant a post-cutoff record; analysis excludes it and emits a
  receipt.
- Every artifact date field is scanned against the declared cutoff.

### Frontend and lineage

- V2 payload validation is render-blocking.
- A declared sample of at least ten metrics per case recomputes in TypeScript
  from the formula registry and matches Python output.
- Every displayed investment number has complete stable metric lineage.
- Any upstream digest mutation produces transitive `STALE` and blocks the
  affected decision until recomputation.
- No source-literal PASS/FAIL is accepted as an accounting test.

## Ordered dependency and stop rule

```text
v2 schemas and formula registry
  -> decision state machine and staleness
  -> exact specs and assignment repairs
  -> AtlasGrid operating/debt/returns engine and oracles
  -> AtlasGrid receipts, sensitivities, value bridge, and coverage
  -> PE INDEPENDENT ACCEPTANCE GATE
  -> Helios event model and exact waterfall
  -> Helios scenarios, receipts, value bridge, and coverage
  -> shared DAG, workbench, memo, and visual acceptance
  -> independent investment, econometric, and benchmark reviews
```

Helios case integration cannot begin until the PE gate is `VERIFIED`. Shared
waterfall primitives may be implemented and oracle-tested earlier, but they may
not be represented as an accepted Helios case.
