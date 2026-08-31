# Expert-readiness correction contract

Status: `FROZEN_BEFORE_IMPLEMENTATION`

Mission: `underwriting-expert-readiness-correction-20260831-v1`

Mission SHA-256: `fc4568c62cdbd9357711327b692bb4b566895bcb070ec7072450ea05dd00c208`

Exact base: `6bebd47bd963a00879601808ef9250e3e0f53e8c`

Target: `EXPERT_REVIEW_CANDIDATE_READY_FOR_PERSONAL_CHATGPT`

## Product boundary

The product is an offline, evidence-linked workbench for exploring two clearly
synthetic underwriting cases. It is not a live-deal system, private-data intake
product, autonomous investment recommendation, investment-accuracy benchmark,
or collaboration platform. The practitioner layer leads with the decision and
the investment workflow. Technical proofs remain available in a separate
appendix and reviewer evidence package.

## Binding decision hierarchy

The engine is the sole author of analytical posture. A failed binding hurdle
forces `HOLD` regardless of attractive point-estimate returns. An open binding
diligence requirement also prevents advancement. Proposed terms and milestones
may describe a path to yes, but may not be presented as the current decision.

The required reader hierarchy is:

```text
Decision -> reason -> economics -> risks -> path to yes -> evidence -> next action
```

## Disposition of the 16 findings

| # | Finding | Disposition | Required implementation | Deterministic acceptance | Residual limitation |
|---:|---|---|---|---|---|
| 1 | Helios contradicts its binding loss hurdle. | `ACCEPT` | Derive `HOLD — LOSS HURDLE NOT MET` from the engine whenever probability below 1.0x exceeds 10%. Treat the $25M close plus $15M reserve only as a path to yes. Propagate the posture through every scenario, view, memo, and export. | Planted-red tests reject every posture/hurdle contradiction and scenario changes cannot bypass the binding rule. | The 20% weight is a declared synthetic analyst stress, not a calibrated real-world loss probability. |
| 2 | Counts and issue labels do not reconcile. | `ACCEPT` | Introduce one typed issue ledger with six buckets: failed quantitative hurdles, advancement blockers, pre-IC requirements, pre-signing requirements, pre-debt-commitment requirements, and nonblocking diligence. Derive all counts and lists from it. | Schema, engine, React, and PDF tests prove identical IDs/counts by case and scenario; reordered records do not change meaning. | Human materiality judgment remains explicit and synthetic. |
| 3 | Practitioner surfaces expose machine and build language. | `ACCEPT` | Remove raw enums, hashes, SHAs, provider/agent names, test terminology, internal selectors, formula variables, credit classes, mutation language, and founder-review state from primary surfaces. Replace them with finance-native copy and move retained detail to the technical record. | Primary-surface scanner fails on the banned vocabulary and rendered route assertions verify approved alternatives. | Technical appendix intentionally retains machine-readable records. |
| 4 | Numerical presentation shows false precision. | `ACCEPT` | Apply a shared formatter: dollars/multiples at one decimal by default, two only at a material threshold; ownership as percent; exact cents only in technical evidence; origin tags of Observed, Calculated, Underwriting assumption, or Scenario. Show immaterial Helios residual as `$0` or `<$1; immaterial`. | Unit and rendered tests cover values, thresholds, residuals, and the absence of the public one-cent boundary claim. | Underlying arithmetic remains exact; display rounding is not a substitute for the technical record. |
| 5 | “One-page memo” is not a literal or well-separated deliverable. | `ACCEPT` | Produce per case: a literal one-page IC snapshot, a detailed underwriting packet, and a separate technical appendix. Enforce audience-specific content boundaries. | PDF contract proves page count, tags, required sections, and absence of technical debris from snapshots. | Documents remain synthetic examples, not completed real-deal IC materials. |
| 6 | Product promise overstates intake and live-deal readiness. | `MODIFY` | Narrow landing page and README to two evidence-linked synthetic cases. Remove/deactivate every visible implication of arbitrary upload or live-deal intake. Document future intake only. Build an intake slice only if it truthfully validates a complete approved versioned synthetic bundle with no dead controls. | Public-content scan and browser flows find no upload/live-deal promise or dead intake control. | Arbitrary private data rooms and document ingestion remain out of scope. |
| 7 | AtlasGrid investment judgment is too thin. | `ACCEPT` | Deepen concentration, contracts, cohorts, pricing, implementation burden, competitive structure, management risk, QoE, debt/cash conversion/covenants, exit support, price defense, and combined stresses using retained evidence and declared assumptions. | Required field/content tests, reconciliation tests, source lineage, and finance invariants pass. | Competitive and management observations are synthetic scenario judgments, not primary interviews. |
| 8 | Helios investment judgment is too thin. | `ACCEPT` | Deepen ICP/buyer/workflow, cohorts, unit economics, GTM/pipeline, competitive archetypes, advantage/moat hypotheses, team risk, financing/dilution/preferences, terminal-growth support, and adverse cases. | Required field/content tests, waterfall conservation, scenario recomputation, and source lineage pass. | Market, team, and moat conclusions remain illustrative synthetic underwriting judgments. |
| 9 | Helios sensitivity is a naked exit-value selector. | `ACCEPT` | Replace it with engine-bound operating drivers: revenue growth, exit multiple, milestone outcome, later-round price/dilution, and ordinary-cohort retention. Recompute terminal revenue/equity, ownership, XIRR, MOIC, loss/hurdle states, and posture. | Every control has a canonical engine result, exact reset behavior, lineage, and planted-red propagation test. | Controls explore precommitted synthetic scenarios; they do not create a forecasting model calibrated to real investments. |
| 10 | Declared priors look empirically calibrated. | `ACCEPT` | Reframe them as scenario-weighted analyst risk tests and display setter, basis, provenance class, and bounded sensitivity. Relabel AtlasGrid 0.00% default as a synthetic scenario result. | Copy/schema tests prohibit calibrated-probability claims without evidence and verify prior provenance. | Scenario weights are judgment inputs, not frequencies or accuracy claims. |
| 11 | Navigation is too broad and technical. | `ACCEPT` | Reduce primary navigation to Overview, Financials, Risks, and Memo. Make Thesis and Value Creation secondary/case-dependent. Combine Sources, Methodology, and Technical Audit under Evidence. Put mobile recommendation and reason directly below the company header. | Desktop/mobile route, reload, back/forward, keyboard, and two-action evidence tests pass. | Static local routing is not collaborative workspace state. |
| 12 | The workflow needs real, consequential interactions. | `ACCEPT` | Support clean case entry, canonical assumption changes, side-by-side scenarios, number-to-source context, risk-to-source and consequence navigation, owner/stage blocker lists, one-page print/export, and deterministic reset. Remove dead controls and misleading persistence. | React and Playwright flows prove every inventoried control changes the declared canonical state or navigation target, resets, and emits no console errors. | Notes, assignments, collaboration, and persistence are `DEFERRED`; no local mock may imply otherwise. |
| 13 | Finance visuals do not yet earn expert attention. | `ACCEPT` | Add PE debt paydown/leverage, cohort retention, and return matrix; add VC cohort/operating trajectory, ownership/dilution bridge, and return waterfall or matrix. Include units, period, scenario, source, and point-of-view caption. | Chart registry and rendered tests prove required metadata, keyboard reachability, and data binding. | Charts remain synthetic and do not establish investment performance. |
| 14 | Editorial density and mobile scanning need restraint. | `ACCEPT` | Reduce headline scale, whitespace, badges, pills, borders, and decorative copy while retaining warm paper, graphite, cobalt, and tabular numerals. Preserve accessibility and mobile hierarchy. | 1440x900 and 390x844 visual evidence; no root overflow, keyboard traps, or critical/serious automated Axe findings. | Automated checks do not constitute comprehensive WCAG certification or practitioner usability proof. |
| 15 | A reviewer needs a trustworthy runnable package. | `ACCEPT` | Produce a compact synthetic-only offline bundle with exact launch instructions, no secrets/private paths/provider artifacts/unrelated dependencies, SHA-256, and a clean-room launch check. | Extraction and launch succeed in a new temporary directory; security/public-content scans pass. | This is a local reviewer artifact, not staging, deployment, or production readiness. |
| 16 | The final review package and practitioner handoff are incomplete. | `MODIFY` | Map evidence to all 16 findings; include base/head, decision/count table, before/after visuals, three artifact types per case, control inventory, desktop/mobile evidence, limitations, and an updated three-practitioner protocol. Stop for Personal ChatGPT review. | Exact-head acceptance and fresh independent Claude review pass with no critical/high findings; medium findings are repaired or remain explicit founder decisions. | Practitioner testing, email, publishing, career claims, demo, ElevenLabs, CoreWeave, and external benchmarks remain `DEFERRED` pending separate authority. |

## Hard implementation gates

1. Phase 1 must close before practitioner-depth or packaging work begins.
2. The engine authors decision posture, issue taxonomy, counts, and scenario
   consequences; React and PDF code only render typed results.
3. Every primary number has a readable source path and technical lineage.
4. No control may be present without a tested effect and deterministic reset.
5. No provider review substitutes for deterministic verification.
6. Claude-authored advice is independently checked by tests and Codex review;
   Claude does not self-certify its own specification.
7. Grok output is advisory only and never enters synthetic case evidence.

## Deferred and rejected scope

- `DEFER`: analyst notes, collaboration, assignment, persistence, arbitrary
  intake, staging/deployment, demo recording, ElevenLabs, publication, email,
  career-material mutation, practitioner testing, CoreWeave, external model
  benchmarks, and private-data use.
- `REJECT`: fake upload flows, dead collaboration controls, improvised provider
  identity, paid/API-key fallback, autonomous investment claims, or any wording
  that presents synthetic recovery as real-world investment accuracy.

## Acceptance authority

The terminal state means the local exact-head candidate and reviewer package are
ready for Cooper's Personal ChatGPT teardown. It does not mean enterprise
proven, practitioner accepted, deployed, published, or safe for real investment
decisions. Any unresolved critical/high independent-review finding forces
`QUALITY_SHORT`.
