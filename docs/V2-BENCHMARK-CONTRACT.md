# Underwriting Intelligence Lab v2 benchmark contract

Status: `FROZEN BEFORE V2 FEATURE RESULTS`
Mission: `underwriting-intelligence-lab-v2-20260829`
Base: `7b1d0238fd7f71901fd807c01b619395c4efee73`

## Reference boundary

The lab is not attempting to match the private-data scale, integrations,
security certifications, customer history, or production deployments of
commercial platforms. The portfolio target is narrower: a public synthetic
demonstration of a complete and reproducible chain from evidence to estimate,
cash flow, terms, decision, and operating action.

Primary reference directions:

- Bessemer public investment memos and operating model: recommendation and
  terms first, candid qualifiers, team judgment, concrete failure modes, and
  intellectual honesty over persuasion.
  - <https://www.bvp.com/memos/toast/>
  - <https://www.bvp.com/memos/shopify>
  - <https://www.bvp.com/atlas/inside-bessemers-operating-model>
- Bain integrated private-equity diligence: strategy, commercial, operations,
  and technology must connect quantitatively; value creation begins in
  diligence and recognizes interdependencies.
  - <https://www.bain.com/contentassets/471f0047d66148a7ae93bcdf80e8468a/bain_brief_integrating_due_diligence_to_build_lasting_value_2.pdf>
  - <https://www.bain.com/insights/topics/global-private-equity-report/>
- KKR Capstone: operating risks and value-creation levers inform asset
  selection, concrete plans, named ownership, and implementation.
  - <https://www.kkr.com/approach/capstone>
- Hebbia Matrix: structured multi-step work, inspectable intermediate output,
  precise source linkage, and reusable workflows rather than a chat-only
  surface.
  - <https://www.hebbia.com/product>
  - <https://www.hebbia.com/blog/introducing-matrix-the-interface-to-agi>
- Rogo Deal Room: governed deal context, diligence tracking, shared facts,
  version continuity, and institutional memory.
  - <https://rogo.com/news/rivanna>

Vendor claims about adoption, accuracy, scale, or customer outcomes remain
vendor-reported and are not acceptance evidence for this lab.

## Differentiated product thesis

The target is not an AI report generator. It is a governed underwriting
compiler:

```text
source evidence
  -> definition and normalization
  -> estimand and uncertainty
  -> operating economics
  -> cash, debt, dilution, and waterfall
  -> price and terms
  -> decision and falsifiers
  -> ownership plan and variance review
```

Its distinctive public demonstrations are:

1. definition-quality findings change bid, earnout, covenant definition,
   financing milestone, or ownership;
2. identified effects may receive probabilistic model credit, while an
   unidentified effect receives zero base-case credit unless a human enters a
   visible scenario;
3. any investment number can be traversed to readable source evidence,
   formula operands, assumptions, and decision impact;
4. the terms solver preserves a declared downside floor rather than maximizing
   an attractive point estimate; and
5. the interactive workpaper and printed IC packet are generated from the same
   receipts and cannot disagree.

## Pattern register

Each adopted pattern has a required test and rendered location. Branding,
layout, copy, and proprietary workflows are not copied.

| ID | Principle adopted | Automatic rejection / anti-pattern | Required acceptance | Rendered location |
|---|---|---|---|---|
| B01 | Recommendation, price, structure, and ownership are immediate. | Decision label without executable terms. | First-viewport test finds posture, price, capital, ownership, and authority state. | IC Snapshot and memo page 1 |
| B02 | Metrics are selected because they prove or disprove the thesis. | Generic KPI dashboard or vanity TAM. | Every snapshot metric has a decision dependency and materiality statement. | IC Snapshot |
| B03 | Candid qualifiers sit beside the headline number. | Limitations hidden in drawers. | Every thesis metric renders its definition gap or principal qualification. | IC Snapshot |
| B04 | Team judgment is role-specific and includes gaps. | Owner titles standing in for management diligence. | Both cases render strengths, unproven areas, key-person risk, and required hires. | Thesis & Evidence / memo |
| B05 | Failure modes describe how the investment loses money. | Generic risk lists. | Each failure mode binds a threshold, scenario consequence, and term or decision response. | IC Snapshot / Underwriting Room |
| B06 | Intellectual honesty explains a decision rather than selling it. | Confidence score, promotional prose, or autonomous recommendation. | Blind reviewer identifies counterthesis and open gates within 60 seconds. | Memo and IC Snapshot |
| B07 | Market, product, customer, competition, team, business model, and terms are synthesized. | Numerically precise case with missing investment context. | Completeness test requires all sections and at least one disconfirming fact per section. | Memo / Thesis & Evidence |
| B08 | Definition differences are priced. | Live/booked, entity/parent, or reported/normalized differences end as badges. | Toggling a permitted definition changes bid, structure, or HOLD and writes a receipt. | Terms solver / DAG |
| F01 | Sources and uses reconcile to cents. | Entry equity equals EV minus one hard-coded debt number. | Independent oracle and property tests across 100 seeds. | AtlasGrid Underwriting Room |
| F02 | Debt is repaid from modeled cash generation. | Exit debt is an independent assumption or random draw. | Cash, debt, revolver, and sweep roll-forwards reconcile by period. | Debt schedule and exit bridge |
| F03 | Return uses dated sponsor cash flows. | IRR computed only as MOIC CAGR. | XIRR oracle matches to frozen tolerance; MOIC also reconciles. | Returns summary / appendix |
| F04 | Scenarios are separate assumption sets and computations. | p10, p50, and p90 relabeled as downside, base, and upside. | Scenario digests differ and each recomputes schedules, returns, and decision state. | Scenario book |
| F05 | Sensitivities rerun the actual model. | Display-only multiplication of MOIC. | Every control changes a canonical receipt and declared downstream metrics. | Underwriting Room |
| F06 | Maximum bid and alternative terms are solved. | Reprice or earnout typed as a narrative constant. | Solver independently reproduces max EV and compares cash price, earnout, rollover, and leverage. | Terms solver |
| F07 | Covenant EBITDA, sponsor EBITDA, and reported EBITDA are explicitly bridged. | Multiple incompatible EBITDA paths treated as one business. | Definition bridge closes and covenant tests consume the lender-defined value. | QoE / debt schedule |
| F08 | VC capitalization is event-based and round-by-round. | One post-money identity plus a generic dilution scalar. | Shares and ownership reconcile after every financing event. | Helios cap-table room |
| F09 | Preferences are typed and evaluated at exact breakpoints. | Hard-coded global preference behavior or float residuals. | Integer-cent/share waterfall matches an independent oracle at all breakpoints. | Waterfall chart and appendix |
| F10 | VC returns are time-aware. | MOIC only and `IRR: n/a`. | Dated investment and proceeds cash flows produce XIRR and MOIC. | Helios returns summary |
| F11 | Materiality determines prominence and gating. | Small planted residual promoted above leverage, margin, or runway. | Each finding records EV, cash, ownership, or decision impact; immaterial items cannot be snapshot drivers. | Snapshot / diligence register |
| F12 | Gross and net return concepts are not conflated. | Unqualified IRR or LP-net implication. | Labels and assumptions explicitly state gross-to-sponsor or gross-to-investor scope. | Snapshot / memo |
| E01 | Every number reaches readable evidence and formula operands in two actions. | Digest and row count presented as evidence. | Complete stable metric-ID coverage test and keyboard path test. | All views / lineage drawer |
| E02 | Evidence locators are spans, rows, cells, or clauses when available. | Whole-document citation when a granular locator exists. | Locator schema and rendered excerpt/row validation. | Lineage drawer |
| E03 | Evidence, economics, and decisions share one dependency system. | Citation kernel and underwriting payload remain disconnected stacks. | Changed source digest marks all affected calculations and decisions stale. | DAG / status bar |
| E04 | Diligence requests are owned and decision-relevant. | Generic document wish list. | Each request has owner, due state, materiality, and explicit decision consequence. | Thesis & Evidence |
| E05 | Accepted uncertainty differs from a blocking deficiency. | Every correct abstention permanently forces global HOLD. | Decision-state machine tests blocking, accepted residual, waiver, stale, and signature cases. | Snapshot / diligence register |
| Q01 | Every analysis states an exact estimand a finance reader can repeat. | Placeholder `output contract for AG-XX`. | Schema rejects placeholder or missing outcome, treatment, population, period, and unit. | Econometric Lab / appendix |
| Q02 | Naive and identified comparisons target the same estimand. | Price slope compared with offer ITT as adjusted versions. | Pairing validation rejects estimand mismatch. | Econometric Lab |
| Q03 | Randomized labels require reproducible random assignment. | First N rows or pods called randomized. | Seed-permutation and balance tests verify the declared mechanism. | Analysis receipt |
| Q04 | Causal estimates appear in the IC only when they affect economics. | Planted-effect recovery used as investment substance. | Downstream-use contract and zero-credit behavior for unused estimates. | DAG / value bridge |
| Q05 | Recovery examples are not coverage claims. | Six runs described as estimator coverage. | At least 500 estimator-specific simulations meet a frozen 92–98% coverage band. | Verification appendix only |
| Q06 | Diagnostics communicate investment meaning. | Methods appendix without a financial consequence. | Every chart caption states what credit is allowed, withdrawn, or left uncertain. | Econometric Lab |
| V01 | Exactly three to five prioritized levers connect diligence to ownership. | Long list of possible improvements. | Priority and screened-out-lever contract passes. | Value Creation |
| V02 | Each lever includes baseline, target, cost, timing, owner, dependency, risk, and stop rule. | C-title plus target and generic risk sentence. | Required-field and state-machine validation. | Value Creation |
| V03 | Lever value reconciles through cash and returns without double counting. | `No standalone value attributed` or additive unsupported upside. | Standalone, interaction, combined, and residual bridge tests. | Value bridge |
| V04 | Identified uncertainty propagates as a distribution or range. | Unsupported point value from a synthetic effect. | Range propagation and zero-base-credit tests. | Value bridge / returns |
| V05 | Ownership cadence begins before close. | Post-close plan disconnected from underwriting. | Day 1/30/100/Year 1 milestones and board KPI cadence required. | Value Creation / memo |
| U01 | The snapshot is sufficient to decide whether to open the appendix. | User must visit every tab to learn what is missing. | Blind 60-second comprehension protocol. | IC Snapshot |
| U02 | Graph relationships are visible and traversable. | Node columns, edge count, or silent truncation. | Full edge render, upstream/downstream keyboard traversal, and no `.slice` truncation. | Thesis & Evidence |
| U03 | Charts answer an underwriting question. | Decorative quantile bars or methods theater. | Chart registry requires question, conclusion, uncertainty, and decision dependency. | All analytical views |
| U04 | PE and VC share contracts but retain strategy-native mechanics. | Covenant field reused for preferences or conditions. | Case-specific semantic type tests. | Underwriting Room |
| U05 | Product state and human authority are unambiguous. | `INVEST` or `REPRICE` visually appears approved beside HOLD and unsigned. | Visual and state-machine tests for illustrative posture, readiness, signature, and blockers. | Global header / Snapshot |
| U06 | Build provenance is inspectable but not product hero content. | Hashes, test counts, or provider names dominate the interface. | Primary-surface text scan rejects self-certifying language. | About/receipt appendix only |
| U07 | Workpaper and memo use the same canonical data. | Hand-authored memo can drift from the app. | Cross-surface digest and value equality tests. | Workbench / print packet |
| C01 | Public claims describe exact synthetic local proof. | Enterprise, real-investment accuracy, hiring impact, or benchmark-superiority claim. | Public-tree claim scan and independent editorial review. | README / memo disclosure |
| C02 | Synthetic disclosure and human attribution are visible. | Machine-attributed investment recommendation. | Screenshot and DOM assertions on every case surface. | All case views |
| C03 | Deferred real-company and model evaluations remain visibly not run. | CoreWeave plan or benchmark adapter implied complete. | Claim-state tests retain `NOT_RUN`. | README / evaluation docs |

## Weighted blind-review scorecard

| Dimension | Weight | Portfolio-candidate requirement |
|---|---:|---|
| Decision clarity and investment judgment | 20 | Terms first; material drivers, failure modes, authority, and kill criteria are immediately clear. |
| Financial and financing mechanics | 25 | Cash-flow-driven PE and event-driven VC models independently reconcile. |
| Evidence, definitions, and lineage | 15 | Granular source-to-formula-to-decision inspection and stale propagation work. |
| Econometric discipline | 10 | Exact estimands, honest identification, decision-relevant use, and coverage evidence pass. |
| Value creation and ownership execution | 15 | Three to five levers reconcile through cash, returns, accountability, and cadence. |
| Interface and institutional presentation | 10 | Finance-native, comprehensible, accessible, responsive, print-ready, and free of fake controls. |
| Public claim discipline | 5 | Every claim matches the exact local synthetic evidence boundary. |

Pass requires a weighted score of at least `88/100`, every dimension at least
`75/100`, no unresolved critical finding, and two independent reviewers who did
not author the relevant implementation.

## Automatic failure triggers

Any trigger forces `QUALITY_SHORT` or `MODEL_INTEGRITY_SHORT`:

- sponsor IRR is only a MOIC CAGR, or VC IRR is absent;
- a named scenario is a relabeled quantile;
- a control changes display state without changing a receipt;
- ask, reprice, and earnout do not use the same hurdles and downside floor;
- an open blocking condition or triggered kill criterion appears as a completed
  investment decision;
- value-creation dollars are absent or double counted;
- debt, cash, shares, ownership, or waterfall proceeds do not reconcile;
- a headline assumption is presented as evidence or an unidentified effect
  receives undisclosed base-case value;
- a displayed investment number lacks unit, period, class, formula operands,
  and granular evidence;
- causal language is used for an observational or unidentified design;
- a hash, test count, model name, or provider agreement is used as primary
  proof of underwriting quality;
- graph nodes or edges are silently truncated;
- a display-only financial control survives; or
- the project claims enterprise readiness, real-company accuracy, autonomous
  investment authority, hiring impact, or investment performance.
