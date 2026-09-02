# Underwriting Desk — product vertical-slice contract

Status: FROZEN BEFORE IMPLEMENTATION  
Base: `5795f00fe7466991605dfba95b7d0d3b90cde5bd`  
Mission: `underwriting-product-vertical-slice-20260901`

## Product decision

The public interface is an underwriting desk, not an AI laboratory. The retained analytical kernel, sample cases, finance engines, econometric receipts, lineage, and exports remain authoritative. The default interface must expose the investment workflow in committee language and reveal technical machinery only on request.

The existing Vite/React application remains the implementation substrate for this slice. Vercel will host the application and a single optional inference function. This is the lowest-disruption path and does not prevent a later Next.js migration when authenticated persistence is justified.

## Information architecture

The product root is **Deals**. In-deal navigation has exactly five destinations:

1. **Overview** — recommendation, rationale, decisive driver, downside, blocker, terms, and next action.
2. **Financials** — scenarios, transaction or financing mechanics, sensitivities, and returns.
3. **Diligence** — blocking issues, evidence tests, notes, observations, assumption review, and model proposals.
4. **Documents** — supported package status, plain-language document search, and optional technical/reproduction drawer.
5. **IC Memo** — fixed committee sections and export actions.

The former Thesis, Value Creation, Explore, Sources, Methodology, and Audit routes are folded into those five destinations through progressive disclosure.

## Visual and language system

- Interface name: **Underwriting Desk**. The repository and technical documentation retain their existing names.
- One sans-serif UI family. Serif is restricted to memo content and at most one screen headline.
- Minimum default text: 12 px desktop and 11 px mobile. Monospace is restricted to technical drawers.
- Neutral surfaces and graphite text. Cobalt means interaction; rust means a financial miss or blocker; green means clear; amber means open.
- No numbered manifesto, gradients, glow, chat bubbles, giant hero type, decorative AI motifs, or repeated synthetic warnings.
- The persistent disclosure is a quiet **Illustrative data** chip. Full language remains in deal information, exported materials, and the footer.
- Default screens expose no hashes, raw paths, schema identifiers, internal analysis IDs, causal-class codes, or untranslated statistical notation.
- Every statistical result is rendered in this order: business meaning; population; decision use; limitation; collapsed technical detail.

Helios HX-06 default language:

> Customers randomly given the optimizer used about 8.7% less compute per workload than customers without it. The result comes from 120 synthetic customers and receives no base-case credit until replicated against production provider invoices.

The `-0.0911 log points` estimate and interval remain available only under **View method**.

## Supported local-first intake

The public slice supports one honest raw-data template: **Growth SaaS Quick Package v1**. It does not claim arbitrary data-room support or full parity with the retained AtlasGrid and Helios engines.

Accepted input is a ZIP or multi-file selection containing:

- `deal.json` — company, cutoff, cash, proposed financing, return assumptions, thresholds, and analyst ownership.
- `monthly_financials.csv` — period, revenue cents, cost-of-revenue cents, and operating-expense cents.
- `customer_arr.csv` — customer ID, period, and ARR cents.
- `manifest.json` — version, file roles, required state, byte count, and SHA-256.

Optional:

- `experiment.csv` — retained as a document only in v1; the public browser does not make a causal claim from it.
- Supporting PDF, DOCX, PPTX, XLSX, CSV, or text files — listed as unsupported-analysis documents and never silently parsed.

Intake states are `RECOGNIZED`, `MISSING`, `INVALID`, `UNSUPPORTED`, `EXCLUDED`, and `READY`.

The browser must:

1. Hash local bytes with Web Crypto.
2. Match files to the manifest.
3. Validate required columns and integer-cent fields.
4. Present explicit column mapping when a supported alias is recognized.
5. Refuse oversize, duplicate, hash-mismatched, or structurally invalid inputs.
6. Keep bytes in memory only. Refresh clears the deal. No file or file content is sent to a server.
7. Compute only the declared v1 metrics: LTM revenue, gross margin, an opening-cohort retention proxy with its exact interval, recent net burn, runway, post-money ownership, terminal revenue scenario, exit equity scenario, gross MOIC, and annualized gross return. Do not relabel the proxy as annual NRR without a full twelve-month comparable cohort.
8. Use integer cents for accounting and explicit decimal rounding for ratios.
9. Render `NO CALL — PACKAGE INCOMPLETE` when any required input is missing or invalid.
10. Render `READY FOR IC REVIEW` only when the package is complete and declared return thresholds clear. This is an analytical posture, not an investment recommendation or approval.
11. Render `HOLD` when the package is complete and a declared threshold or runway floor misses.

The existing Python `underwriting-lab analyze` path remains the full-fidelity route for retained evidence packets, econometrics, debt, dilution, preferences, Monte Carlo, and complete lineage. Its `workbench-case/v2` output may be imported as an advanced package after v1; raw intake must never be presented as equivalent.

## Model workflow

The only in-product model job is **Challenge selected evidence**.

Input is an explicit user-selected subset of registered evidence. Output is schema-constrained:

- `challenges[]`: claim, evidence references, severity, management question.
- `gaps[]`: title, why it matters, proposed owner, linked issue when available.
- `memo_drafts[]`: memo section, draft text, evidence references.

Every reference must resolve to a selected local evidence identifier. Uncited items are dropped and counted. Output enters a **Proposed** tray in Diligence. It cannot change financial mechanics, assumptions, package completeness, issue severity, recommendation, or approval.

When no runtime credential is configured, the interface states that model review is unavailable. No canned model output is shown, and every deterministic workflow remains functional.

## API and MCP boundary

API is used only for the optional inference job. The public browser sends only the selected evidence subset after an explicit confirmation. Provider credentials never enter the browser bundle or repository.

MCP is a local interoperability surface, not the inference transport and not a public underwriting endpoint.

Read tools:

- `list_deals`
- `get_decision`
- `get_decision_tests`
- `list_issues`
- `get_metric_lineage`
- `search_package`
- `list_analyses`

Proposal tools:

- `propose_observation`
- `propose_diligence_request`
- `propose_memo_section`

Proposal tools return `PROPOSED` with a proposal ID. No tool may set a decision, approve an investment, approve an assumption, change a metric, change a policy threshold, or write the canonical case file.

## Tailwind Plus use

Cooper confirmed an active Tailwind Plus license. Catalyst components may be copied selectively for the sidebar shell, buttons, tables, badges, dialogs, description lists, and form controls. They must be customized to this contract and kept under the Tailwind Plus license, with a dedicated notice. They are not relicensed under the repository's Apache-2.0 license.

Stock Catalyst layouts, dark mode, motion flourishes, and broad component copying are out of scope.

## Release acceptance

1. A third deal is created from a supported package through ordinary UI controls with no source-code change.
2. Removing one required file produces `NO CALL`, hides return conclusions, and identifies the missing item.
3. Hash mismatch, malformed cents, duplicate period rows, and unsupported files are deterministic and tested.
4. Exactly five in-deal destinations are visible.
5. Default-screen scan finds no 64-character hashes, schema strings, raw data paths, internal analysis IDs, `log points`, `ITT`, `SMD`, or `MC SE` outside collapsed technical content.
6. The decision appears once above the fold.
7. Model unavailable, valid structured response, uncited-item rejection, and no-canonical-mutation paths are tested.
8. MCP proposal tools return `PROPOSED`; forbidden mutation tools do not exist; canonical case digests remain unchanged.
9. Existing Python, regression, package, and workbench contracts remain passing or are intentionally updated without weakening the governed analytical kernel.
10. Desktop and mobile browser flows cover Deals, intake, incomplete failure, completed analysis, each destination, lineage, model state, and memo export with no critical or serious automated accessibility findings.
11. The Vercel deployment is verified through the intake flow, not only by loading a sample case.
12. Practitioner testing remains `NOT RUN` unless observed evidence is collected.

Terminal state: `PORTFOLIO_PRODUCT_CANDIDATE_READY_FOR_FOUNDER_REVIEW`, otherwise a literal blocker or `QUALITY_SHORT`.
