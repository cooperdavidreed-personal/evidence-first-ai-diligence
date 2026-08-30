# Underwriting Intelligence Lab econometrics contract v2

Status: `V2.1 AMENDMENT — NUMERIC RESULTS REGENERATED AND REVERIFIED`
Contract version: `underwriting-econometrics/v2.1`
Cutoff: `2026-08-29T00:00:00Z`

This contract supersedes v1 for the v2 mission. V1 remains retained as the
historical contract; its future-dated cutoff and AG-08 method description are
not used by v2 generated artifacts.

## V2.1 scenario-simulation amendment

The historical v1 requirement of 20,000 draws for AG-11 and HX-09 is
superseded by exactly 1,000 deterministic scenario paths per case. This is a
compute-bounded scenario stress sample, not a precision study, forecast, or
model-accuracy estimate. It is sufficient for stable portfolio interaction,
replay, mutation, and distribution-shape verification; it is not used to claim
that tail probabilities are known precisely.

For every displayed binary path probability, the candidate reports the
binomial Monte Carlo standard error `sqrt(p * (1-p) / 1000)` in percentage
points. Quantile locations and probability estimates must be interpreted at
this disclosed resolution. Draw counts may not be increased or decreased
without another versioned amendment and regenerated receipts.

This amendment was issued during an independent documentation audit. No
recovery tolerance, causal interval, planted effect, decision hurdle, or
accounting gate was widened. All affected case JSON, receipts, screenshots,
memo artifacts, and verification evidence must therefore be regenerated from
the amended implementation before acceptance.

## Frozen changes from v1

- The last complete observed monthly period is July 2026. August 2026 is not
  treated as a completed monthly observation.
- The pricing experiment uses seeded Bernoulli assignment with probability
  0.5; exact 1:1 realized allocation is not claimed.
- AG-08 uses one pre/post delta per pod followed by a two-sample treated-minus-
  control estimate. The canonical 40-pod fixture has 20 pods per arm; fewer
  than 20 pods or fewer than 10 pods per arm is `NOT_IDENTIFIED`.
- A pricing record observed after the cutoff is planted, excluded without
  truth access, and retained in a temporal-scan receipt.
- AG-07 renewal ITT, AG-08 resolution ATT, and AG-08 churn ATT each use the
  same unchanged runtime estimator across 500 fixed independent seeds.
- Nominal 95% intervals pass only when unrounded marginal empirical coverage
  is inclusively between 92% and 98%. No rerolls, filtered simulations, joint-
  coverage claim, Bayesian coverage claim, or real-world accuracy claim is
  permitted.

All other causal boundaries, classifications, zero-credit rules, accounting
identities, and truth-isolation requirements in the accepted v2 model-integrity
contract remain controlling.
