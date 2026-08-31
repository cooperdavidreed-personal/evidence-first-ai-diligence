# Investor workspace redesign contract

Status: `FROZEN_BEFORE_IMPLEMENTATION`

Mission: `underwriting-investor-workspace-redesign-20260831-v2`

Exact base: `9b5cdc3b10b6b6cfd88fb4a14eef7d5a58df7a43`

Target: `USABILITY_CANDIDATE_READY_FOR_OBSERVED_TESTING`

## Product promise

Turn a data room and financial assumptions into a decision-ready investment
view, with every important conclusion traceable to its source.

The default experience is a deal workspace. It must not feel like a model
governance console, an AI demonstration, or a verification report.

## Reader contract

Without instructions, a reader must answer in this order:

1. What is the recommendation?
2. Why?
3. What are the relevant terms and return outcomes?
4. What are the three principal risks?
5. What assumption is most likely to change the answer?
6. What remains unresolved?
7. What happens next?

The default hierarchy is:

```text
Decision -> Why -> Economics -> Risks -> What changes the answer -> Next step
```

## Two-layer architecture

### Layer 1: investor workspace

The default layer contains recommendation, thesis, drivers, risks, terms,
returns, material assumptions, diligence questions, and next action.

Primary navigation:

1. Overview
2. Thesis
3. Financials & Returns
4. Risks & Diligence
5. Value Creation
6. Memo

Secondary utilities:

- Explore the deal
- Sources
- Methodology
- Audit details

### Layer 2: evidence and methodology

This layer retains source excerpts, complete number lineage, formula operands,
econometric limits, human-review history, hashes, provider details, tests, and
technical logs. It is available through contextual controls and no more than
two disclosure levels. It never competes visually with the decision.

## First-time journey

1. The landing page states the product promise in one sentence.
2. One dominant action says `Review a sample deal`.
3. The reader chooses AtlasGrid or Helios from two concise case descriptions.
4. The selected case opens directly to Overview.
5. Contextual questions deep-link to retained answers:
   - What would change this recommendation?
   - Show the evidence for the decisive operating metric.
   - What happens to returns when the material assumption changes?
   - Open the decision summary.
6. `Start a new deal` is labeled as a workflow preview until ingestion exists.

There is no free-form chat claim, upload control, autonomous recommendation,
or runtime model implication in this static candidate.

## Overview contract

Each case displays:

- recommendation in ordinary investment language;
- one-sentence thesis;
- three value drivers;
- three principal risks;
- entry price or financing terms;
- base, downside, and upside return outcomes;
- the material assumption control;
- unresolved diligence questions;
- one clear next action;
- direct `Show sources`, `Test an assumption`, and `Open memo` actions.

Above the fold, AtlasGrid prioritizes seller ask, proposed price, leverage,
base and downside returns, maximum bid, three risks, the entry-price control,
and one next owner/action. Helios prioritizes first close, conditional tranche,
fully diluted ownership and pool treatment, runway, base and downside returns,
three risks, the exit-value control, and one next owner/action. High-case VC
returns never outrank check size, ownership, downside, or financing gates.

`REPRICE` and `CONDITIONAL INVEST` are analytical recommendations. Open
diligence remains visible in ordinary language, but machine authority states
and signature codes do not lead the page.

The case data is the sole author of displayed recommendation posture,
condition states, credit tiers, hurdle designations, and open-condition counts.
React renders these fields and may not derive, reorder, override, or infer
them. Overview states authority once in ordinary language:

`Analytical recommendation: [recommendation]. Workflow: not approved; [N]
diligence items open.`

Internal signature codes, receipt states, and provider or verification status
remain under Audit details.

## Case-specific first read

### AtlasGrid

- First question: `Do we bid $210M or walk?`
- Recommendation: reprice from seller ask to a structure that clears the
  declared return and downside requirements.
- Decisive evidence: normalized earnings, full-cohort retention, and
  parent-account concentration weaken seller-reported quality.
- Economics: seller ask, proposed price, leverage, base returns, downside
  returns, and maximum bid.
- Risks: churn, multiple compression, and debt/covenant fragility.
- Open questions: retention definitions, concentration, and enforceable ARR.
- Next action: complete the named diligence work and negotiate price/structure.

### Helios

- First question: `Do we close $25M and withhold $15M?`
- Recommendation: invest only under milestone-based financing and resolved
  pipeline, unit-cost, and executed-term conditions.
- Decisive evidence: ordinary-cohort retention and improving gross margin are
  offset by pipeline inflation and financing dependency.
- Economics: first close, conditional tranche, fully diluted ownership,
  dilution, runway, base returns, and downside returns.
- Risks: down-round dilution, weak exit economics, provider economics, and
  financing shortfall.
- Open questions: pipeline history, provider unit costs, and executed terms.
- Next action: withhold contingent capital until the stated milestones clear.

## Material assumption contract

Controls select precomputed canonical engine results. They do not calculate a
display-only approximation.

- AtlasGrid: entry enterprise value at `$200M`, `$210M`, or `$220M`, holding
  the declared 6.5x exit multiple and retained operating case constant. The
  control must expose the 22 percent hurdle crossing.
- Helios: exit value at `$400M`, `$800M`, or `$1.2B`, rerunning the full
  financing, fully diluted ownership, preference waterfall, dated cash flows,
  XIRR, and MOIC. The lower case must expose the relevant hurdle crossing and
  state whether unissued options are cancelled or modeled as fully granted
  common at exit.

For every selection the interface displays:

- changed gross IRR and MOIC;
- changed ownership, debt, liquidity, or another strategy-native consequence;
- whether a declared hurdle crossed;
- whether the analytical recommendation changes;
- one sentence explaining why;
- the governing canonical receipt.

The receipt stays in Audit details, not the default result.

## Analytical authorship and credibility contract

- Evidence mappings carry an engine-authored `credit_tier` from the closed
  vocabulary `BASE_CASE`, `VALUE_CREATION_BRIDGE`, `SCENARIO_ONLY`, or `ZERO`.
  AG-08 is `VALUE_CREATION_BRIDGE`; React contains no substring inference or
  analysis-specific override.
- Decision conditions are versioned records with stable IDs, ordinary-language
  text, state, linked metric IDs, and designation. A quantitatively cleared
  condition must bind to at least one passing metric. Array position has no
  meaning. Open-condition counts are derived in Python.
- Probability hurdles declare `BINDING` or `INFORMATIONAL`. A binding hurdle
  must fail in at least one retained stress case; informational metrics do not
  inflate the cleared-condition count.
- Scenario priors are precommitted in a versioned receipt with stated
  plausibility bands and rationale. Changing a prior changes the distribution
  receipt and Methodology display. These are synthetic stress inputs, not
  forecasts or empirical investment-loss estimates.
- Helios reports both issued-basis legal proceeds and a conservative fully
  diluted exit sensitivity. The waterfall conserves exit value under both
  `UNISSUED_CANCELLED` and `FULLY_GRANTED_COMMON`, and the investor never earns
  more under the conservative treatment.
- Human-judgment value-creation amounts are displayed as low/base/high ranges
  with no more than two significant figures and the word `illustrative`.
  They are excluded from any headline identified-value total.

## Contextual source contract

Clicking a critical number or conclusion opens a panel beside the current
screen with:

1. plain-language definition and period;
2. why the item matters to the decision;
3. source document and page, section, or retained record;
4. readable excerpt;
5. calculation basis and visible operands;
6. downstream term, return, or recommendation consequence.

Raw IDs, hashes, selectors, JSON, and test metadata are collapsed under Audit
details.

## Copy and visual rules

- Use concise analyst language.
- Remove repeated AI labels, state-machine terminology, internal variable
  names, raw IDs, unexplained acronyms, and generic confidence scores.
- Replace `human input required` with a named question, `Needs judgment`,
  `Confirm with management`, or `Diligence required`.
- Avoid false precision and unsupported probability interpretation.
- Reduce pills, badges, borders, uppercase labels, metadata, icons, and colors.
- Preserve warm paper, graphite typography, restrained cobalt, and tabular
  numerals.
- Fix the maximum-bid separator defect and mobile metadata readability.
- Company identity and a one-sentence product/customer description precede lab
  identity. The primary overview ends with one owner, one artifact, and one
  timing commitment rather than an operating cadence.

## Browser acceptance

- Landing and both sample cases work without instructions.
- All six routes reload and restore through back and forward navigation.
- A reader can reach a source, assumption, or memo within two actions from
  Overview.
- Both assumption controls change canonical results and hurdle interpretation.
- Reordering condition records cannot change their displayed states.
- React contains no hard-coded analytical condition states, credit inference,
  or recommendation override.
- AG-08 cannot be promoted to `BASE_CASE`; a planted-red contract test proves
  the rejection.
- Helios distribution loss probability falls inside the frozen synthetic prior
  band, AtlasGrid covenant-breach probability is nonzero, and both displayed
  Methodology hashes match their canonical receipts.
- Every critical number remains keyboard inspectable and returns focus on
  close.
- At 1440 by 900 and 390 by 844 there is no root overflow, clipped label,
  horizontal-navigation dependency, or keyboard trap.
- Tested routes have no critical or serious automated accessibility finding.
- Both cases retain `SYNTHETIC — NOT INVESTMENT ADVICE`.
- Human usability validation, hosted behavior, enterprise adoption, and real
  investment accuracy remain `NOT RUN`.

## Deferred work

CoreWeave, model benchmarks, live ingestion, backend services, enterprise
integrations, ElevenLabs audio, deployment, publication, and career-profile
mutation are not part of this mission.
