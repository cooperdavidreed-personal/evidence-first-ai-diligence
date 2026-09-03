# Underwriting Desk desktop design rebuild — 2026-09-03

Branch: `claude/underwriting-design-rebuild` · base: `e866ca110da4b7c61c4543dd1b8135c6cb251ce6`

Scope: the visible desktop experience of the Underwriting Desk at 1440×900.
Deterministic finance, evidence lineage, version control, human approvals,
export mechanics, synthetic-data honesty, and the governed-model boundary are
unchanged. Phone rendering is explicitly out of scope for this pass.

## What changed

### Information architecture

Every deal view now answers the questions a practitioner asks, in order:

| Question | Where it is answered |
| --- | --- |
| What is the company and transaction? | Overview → *Company and transaction* fact table (product, market, team behind one disclosure) |
| What is the current investment thesis? | Overview → *Current view* — headline, rationale, then a reasoned list: supporting evidence, concerns, decision-changing variables, remaining work, next committee step |
| What evidence supports it? | Overview → headline measures with an interpretation and a *Trace source* action; *What supports the thesis* column |
| What contradicts it? | Overview → *What contradicts it* column (counterthesis, falsifiers, screens that miss) |
| What are base, downside, and upside returns? | Overview → *Returns across retained scenarios* table; Financials → scenario tabs, comparison, debt/cash charts |
| Which assumptions drive the result? | Overview → *Return swing across retained sensitivities*; Financials → one-way sensitivity and heatmap |
| What changes the recommendation? | Overview → investment screens against the working policy, *What must be true* |
| What diligence remains? | Overview → *What diligence remains* (owners, priority); Diligence worklist with stage |
| What changed from the prior version? | Overview → change control (AtlasGrid retained revision; local Version 2 delivery) |
| Is this ready for the next IC step? | Overview → *Ready for the next IC step?* readiness list; IC Memo → export readiness checks |

The shell is a compact graphite left rail (deal switcher, five destinations,
the five questions the destinations answer, model settings, save state), a
full-width analytical workspace, and a contextual right-hand decision rail
that is now present on every view. The rail shows posture, scenario state,
canonical conditions, worklist count, policy state, the primary decision
condition, the next action, and — on Financials, Diligence, Documents, and
Memo — a view-specific consequence line (for example the return consequence
of an unapproved what-if). The rail also carries the single persistent
synthetic/not-investment-advice disclosure; the repeated footers were removed.

### Language and decision presentation

- The posture word (`REPRICE`, `HOLD`) is a small status label in the rail and
  topbar. The centerpiece is a reasoned headline ("Reprice rather than meet
  the ask") followed by the rationale and a structured argument.
- "Human context" became **Analyst notes & observations**.
- Committee state is stated as "IC decision pending" / "committee decision
  pending"; the retained `PENDING_FOUNDER_SIGNATURE` field is never displayed.
- Every headline measure carries a one-line interpretation and a trace action.
- Lineage drawer excerpts render as tables or labelled fields (dates
  humanized, cents formatted) instead of raw key/value dumps. Metric ids,
  receipts, and digests stay behind *Audit detail* / *Reproduction detail*.
- Decorative taxonomy pills were removed from Documents.

### Intake — confirmed defect fixed

`DealIntake` previously replaced its file array on every `<input>` change,
so choosing files in two steps lost the first selection even though the
input advertised `multiple`. The intake now uses `src/intake-package.ts`:

- one drop zone that accepts files, folders (`webkitdirectory` and dropped
  directory entries), and ZIP archives (expanded with `fflate`);
- sequential selections and drops **add**; re-choosing a listed filename
  replaces that entry and says so;
- a visible five-item checklist (package declaration, deal terms, operating
  model, customer data, management update) with per-file *Replace* and
  *Remove*;
- one click loads the complete synthetic Northstar sample;
- plain-language explanation of what is missing, and *Validate and analyze*
  stays disabled until the minimum package is genuinely present;
- the deterministic engine (`intake.ts`) still validates bytes, digests,
  mappings, and cutoffs exactly as before.

Tests: `src/intake-package.test.ts` (additive selection, replace/remove,
readiness explanation, ZIP expansion, sample loading) and Playwright
`sequential selections add to the package…`, `one click loads the complete
synthetic sample package`, and the rewritten missing-input test.

### Financials

- Retained debt and cash schedules render as SVG line charts (covenant
  breach months highlighted) instead of unlabeled bar tapes.
- A **value creation bridge** shows the retained base case, each lever's
  standalone rerun (with its credit classification and implementation cost),
  the interaction residual, and the combined rerun. No lever is credited in
  the recommendation and the copy says so.
- The scenario returns table on Overview and the sensitivity heatmap (selected
  structure outlined) make scenario-to-decision consequences visible.

### Visual system

Warm neutral canvas (`#f3f0e9`), white surfaces, graphite ink, one deep
cobalt accent, tabular numerals everywhere numbers appear, 13px base with
12px minimum visible text, compact tables with uppercase 12px column heads,
and a small status vocabulary (clears / misses / open / proposed / accepted /
rejected / stale / blocked). No gradients, glow, hero type, or pills beyond
the status vocabulary. Focus rings are a 2px cobalt outline on every control.

The stylesheet was rewritten as one layer; the previous "legacy" cascade
layer is gone.

## Verification

- `pnpm test` — 135 vitest tests (126 before + 9 new intake package tests).
- `pnpm test:mcp` — 9 pass.
- `pnpm build` and `pnpm verify:chunks` — pass.
- Playwright desktop project — 31 pass, 2 mobile-only skipped (run on
  Playwright's bundled Chromium via `PLAYWRIGHT_CHROMIUM_CHANNEL=bundled`
  and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; the default remains the Chrome
  channel). Axe critical/serious findings: none on every tested route.
- Before/after screenshots: `verification/design-rebuild-20260903/before`
  (prior baselines) and `.../after` (this pass), plus the refreshed
  `dist/visual-evidence` baselines and `verification/accessibility-evidence`.

## Remaining limitations and candid notes

- The Helios rationale and several issue consequences are retained case
  text; they are long and still carry synthetic-model vocabulary
  ("scenario mechanics", "seeded replay") that `investorLanguage` only
  partially softens.
- The Snowflake public-record page and the model-connection dialog were
  re-themed through tokens but not restructured.
- Memo section bodies are generated by `scenarioMemoSummary` and still open
  with the posture word ("REPRICE.") because downstream export tests bind to
  that text.
- The value-creation bridge uses retained deltas only; there is no
  interactive lever selection.
- Proposal cards still show a 12-character response receipt; hosted-review
  acceptance tests assert it.
- WebKit was not exercised in this container (no WebKit binary); the
  `desktop-webkit` project remains in the config for the review machine.
- Observed practitioner usability remains NOT_RUN. Phone layouts are
  untested and the shell assumes ≥1024px.
- Synthetic constructs that are not practitioner-grade: the sensitivity
  heatmap is a fixed 3×3 retained grid; the local Quick Package return case
  is debt-neutral with no preference or dilution mechanics; the "Ready for
  the next IC step" list reflects Desk state only, not a real committee
  workflow.
