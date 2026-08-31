# Investor experience and publication contract

Status: `FROZEN_BEFORE_PRODUCTIZATION_FEATURE_RESULTS`

Mission: `underwriting-investor-experience-release-20260830`

Base: `28893ad630ce7dea50f890448263d8096d75132f`

## Product question

The workbench must help an investment professional answer, in order:

1. What is the analytical posture, and what is the current human authority state?
2. What price, structure, capital, or ownership is proposed?
3. Which facts change the economics?
4. How does the investment lose money?
5. Which unresolved gates prevent advancement?
6. What evidence and calculation support any displayed number?
7. What changes under an alternate scenario or diligence result?
8. What would the owner do after close or funding?

The interface is an underwriting workpaper, not an autonomous recommendation,
AI dashboard, generic KPI portal, or production diligence platform.

## Strategy-native reader journeys

### AtlasGrid — PE / growth buyout

The first viewport must distinguish `REPRICE` as an analytical posture from
`HOLD`, `PENDING HUMAN`, and `PENDING FOUNDER SIGNATURE`. It must show the
selected entry price and financing structure, return hurdles, the decisive
definition-quality distortions, the most material loss case, and the exact
blocking diligence gates. The next actions are: inspect the definition bridge,
compare seller ask / selected / downside, inspect debt and covenant mechanics,
and trace a number to source evidence.

### Helios — VC / growth financing

The first viewport must distinguish `CONDITIONAL INVEST` as an analytical
posture from the same human-authority gates. It must show the first close,
conditional tranche, fully diluted ownership, milestone-case returns, the
decisive retention / margin / pipeline evidence, the most material downside,
and the exact blocking diligence gates. Runway labels must distinguish current
cash runway, post-close modeled runway, and the modeled projection ceiling.
The next actions are: compare milestone states and financing structures,
inspect dilution and preference waterfalls, and trace a number to source
evidence.

## Information architecture

The stable route vocabulary uses a versioned hash prefix so every route reloads
correctly from a static GitHub Pages project subpath without server rewrites:

```text
#/v2/:case/snapshot
#/v2/:case/evidence
#/v2/:case/econometrics
#/v2/:case/underwriting
#/v2/:case/value-creation
```

This is a hosting realization of the originally planned case/view vocabulary;
it does not change view semantics, case identity, or deep-link state.

Query state may add a focused metric, finding, source, scenario, sensitivity,
or thesis path. Back/forward navigation must restore the same case, view, and
focused evidence without network state.

The default reading hierarchy is:

```text
posture and authority
  -> executable terms and hurdles
  -> decisive evidence and loss cases
  -> blocking gates and next actions
  -> scenarios and operating consequences
  -> readable lineage
  -> audit metadata
```

Hashes, raw cents, selectors, provider names, test counts, and receipt IDs may
appear only in an explicit audit layer. They never serve as primary evidence
of investment quality.

## State vocabulary

- `Analytical posture`: the model-supported course of action to be considered.
- `Workflow disposition`: whether the case may advance. `HOLD` means it may not.
- `Human authority`: whether an authorized person has adjudicated the posture.
- `Signature state`: whether the decision record is executed.
- `Blocking diligence gate`: missing evidence that prevents advancement.
- `Kill criterion`: an observed threshold that invalidates the thesis when
  triggered; an untriggered kill criterion does not clear unrelated gates.
- `Warning`: a material weakness already reflected in terms, credit, or
  scenarios but not independently blocking.
- `Accepted residual`: a bounded uncertainty explicitly accepted by a human;
  no synthetic case may imply such acceptance without a signed record.

Aggregation rule: any open critical gate, stale decision dependency, missing
required signature, or pending human adjudication keeps the workflow at
`HOLD`, even when all numerical hurdles clear.

## Progressive lineage

Every investment number opens a four-level inspection surface:

1. **Meaning** — plain-language definition, period, classification, and why it
   matters to the decision.
2. **Calculation** — formula, visible operands, and modeled downstream impact.
3. **Source** — readable retained excerpt and a link to the complete committed
   synthetic source.
4. **Audit** — raw canonical value, quantum, hashes, selectors, receipt, and
   machine identifiers.

The first level is the default. A reader must not parse JSON, hashes, or cents
to understand the number.

## Econometric credit rule

Every econometric result must say one of:

- `BASE_CASE_CREDIT` — identified result changes a declared operating or cash
  assumption within a precommitted range;
- `SCENARIO_ONLY` — result is explored only in sensitivity / scenario state;
- `ZERO_CREDIT` — result receives no base-case value because identification or
  transferability is insufficient.

The interface must show the affected assumption and the resulting price,
terms, cash, ownership, or return consequence. Method detail remains available
but does not lead the reading path.

## Frozen comprehension protocol

A context-blind reviewer receives only one 1440 by 900 snapshot image per case
and 60 seconds per image. For each case the reviewer must identify:

1. analytical posture and current human-authority / workflow state;
2. proposed price, capital, ownership, or structure;
3. most decision-relevant driver and its economic consequence;
4. clearest loss case or counterthesis;
5. at least one exact blocking gate and the consequence if unresolved.

Ambiguity between posture and approval fails. A response inferred only from a
technical status code, hash, tooltip, or another view fails. AtlasGrid must
pass before Helios implementation begins; both final snapshots must pass on
the exact candidate images.

## Browser and product acceptance

- Stable routes restore case and view after reload and browser back/forward.
- Every metric remains keyboard inspectable and returns focus on close.
- The lineage default contains business meaning and no raw hash or JSON block.
- Evidence search filters source, finding, analysis, request, owner, state, and
  materiality locally.
- Desktop and mobile have no root overflow or horizontal navigation dependency.
- Every sensitivity interaction changes a canonical receipt-bound result; no
  display-only financial control is permitted.
- Both cases render `SYNTHETIC — NOT INVESTMENT ADVICE` and retain `HOLD` until
  the declared human gates are actually satisfied.

## Benchmark boundary

The work adopts the recommendation clarity of Bessemer public memos, the
diligence-to-value-creation connection described by Bain and KKR Capstone, and
the structured source inspection and governed deal context demonstrated by
Hebbia and Rogo. It does not copy their branding and does not claim their
private data scale, integrations, customer outcomes, security posture, or
production maturity. The exact benchmark URLs and anti-pattern register remain
in `docs/V2-BENCHMARK-CONTRACT.md`.

## Publication gate

Productization is accepted only after deterministic acceptance, fresh blind
comprehension, independent finance / evidence / product / security review, and
a fresh Claude review of one exact final commit. The final provider score must
be at least 88/100, every category at least 75, and no critical finding may
remain. Until then the only valid terminal states are a local publication
candidate, `QUALITY_SHORT`, `MODEL_INTEGRITY_SHORT`, `HELD_PROVIDER`, or another
explicit blocker. No hosted, enterprise, hiring-impact, or investment-accuracy
claim is authorized.
