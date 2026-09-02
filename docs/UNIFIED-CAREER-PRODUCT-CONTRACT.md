# Underwriting Desk unified career-product contract

Status: `FROZEN_BEFORE_IMPLEMENTATION`

Frozen from exact branch state `a05ce6592a0acc102211ffe9472814c5b44d2a41` under mission `underwriting-unified-career-product-20260901`.

This contract supersedes the public-release composition in the earlier vertical-slice contract. It does not supersede the evidence kernel, financial engines, v2 model-integrity contract, v2 econometrics contract, source-room bindings, or synthetic-case truth boundaries.

## Product thesis

The Desk owns the canonical deal state. Deterministic code owns calculations. The fund or IC owns policy. Analysts own declared assumptions and observations. Humans own dispositions and decisions. Models are replaceable advisory workers whose evidence-bound proposals begin as `PROPOSED` and have no direct route to the books, policy, assumptions, issues, recommendation, or approval.

The product must demonstrate a workflow that a general chat product does not provide: durable typed state, deterministic transaction math, policy and assumption separation, source-level lineage, scenario versioning, issue workflow, named human approval, and reproducible memo export.

## Verified starting state

- Authoritative working branch: `codex/underwriting-product-vertical-slice` at `a05ce6592a0acc102211ffe9472814c5b44d2a41`; clean, `28` commits ahead and `0` behind `origin/main` at checkpoint.
- Default branch and GitHub Pages: `origin/main` at `5795f00fe7466991605dfba95b7d0d3b90cde5bd`, serving the stale `Underwriting Intelligence Lab` experience.
- Current Vercel alias: `https://underwriting-desk-delta.vercel.app/`, direct static Drop-to-Deploy `dpl_4uE7h1pEe5XBXKh11QqNNFpS5ERw`; not Git-backed.
- Current branch CI: GitHub Actions run `33541276566`, nine of nine jobs passed.
- Retained case payload: SHA-256 `d3093e468b6aee69871dca8cb79e9dd869cbf8441555ac3d7166bf5863b6c95b`, byte-identical to the prior stronger public release.
- Preserved ElevenLabs demonstration: 86 seconds, SHA-256 `fd3b692b9b5eccb0ae353eda0c9a7d3b5c8e80b4756b46fc4ee7900bdc06d38c`; valid retained production asset, stale as the final demonstration because it shows the old `/v2` interface.
- Six partner PDFs remain tracked and digest-bound. They are retained inputs, not accepted final outputs until regenerated against the unified product.
- Live defects reproduced: stale `main`/Pages and repository metadata, manual Vercel deployment, Northstar self-authorization, read-only retained-case workflow, filename-only source browsing, raw ISO timestamp, incorrect `Pending founder signature` language, broken Back synchronization, and nonzero scroll after Deals-to-deal navigation at mobile width.
- Gmail message-read scope was not independently established in the current connector boundary. The complete directive supplied in the active user request and the retained local review package are the authoritative input; no unverified mailbox access is claimed.

## Preserve, change, retire

### Preserve

- Python 3.11+ CLIs, evidence kernel, source-room generation, deterministic PE and VC engines, formula and metric registries, independent finance oracles, recovery ledgers, and fail-closed schema validation.
- AtlasGrid and Helios synthetic cases, the Northstar Growth SaaS Quick Package v1 intake, and the rule that dynamic intake receives no econometric claim without supporting evidence.
- Existing proposal schema, evidence-reference admission checks, `PROPOSED` default, and named human accept/reject boundary.
- Prior release mechanics at `5795f00`: scenario and comparison controls, PE sensitivities and debt tape, VC ownership/runway/waterfall and risk lab, exact source drawer, cross-record evidence search, notes, observations, assumption disposition, local persistence, judgment export, issue-to-evidence navigation, and partner-document links.
- Current five-destination information architecture: Deals, Overview, Financials, Diligence, Documents, and IC Memo.
- Six PDFs, old ElevenLabs production assets, verification scripts, CI matrices, Playwright/Axe/pixel/PDF evidence, and provider receipts as retained historical evidence.

### Change

- Introduce an application-owned policy profile outside uploaded deal files. Every threshold has an id, label, metric, comparator, value, units, owner role and name, provenance source, status, last-reviewed date or `Not reviewed`, and override protocol.
- Parse package-supplied thresholds only as untrusted management or package representations. They never authorize advancement.
- Create a typed deal-state envelope with facts, terms, assumptions, policy references, calculation snapshot, issues, observations, proposal ledger, human dispositions, memo edits, canonical scenario id, working scenario, and version metadata. Persist browser-locally and support portable JSON export/import with validation.
- Restore retained mechanics inside a new finance-native shell rather than restoring the rejected old visual shell.
- Implement one server-side synthetic-only challenge endpoint. The browser submits only the user-confirmed evidence subset and a bounded job type. The server returns the existing structured proposal schema. No browser provider key is accepted or emitted.
- Regenerate career-facing PDFs and the demonstration only after the live workflow is stable.

### Retire or demote

- The old Lab public entry point, its oversized editorial and red-warning treatment, repetitive synthetic labels, broad technical navigation, and stale `/v2` demonstration as current product proof.
- Uploaded policy thresholds as decision gates.
- The current terminal/JSONL onboarding path from the default practitioner journey; retain it only under Advanced local integrations documentation.
- Raw timestamps, schema ids, hashes, internal codes, engine labels, and developer language from default surfaces.
- Any claim of enterprise security, confidential-data readiness, arbitrary data-room support, real-company underwriting accuracy, firm adoption, practitioner validation, or model authority.

## Decision-state boundary

The canonical state uses seven non-interchangeable domains:

1. `SOURCE_FACT` and `MANAGEMENT_REPRESENTATION`: immutable admitted evidence with source locator and cutoff.
2. `DEAL_TERM`: proposed legal or economic term with document provenance and review status.
3. `ANALYST_ASSUMPTION`: editable only through a working scenario; must show owner, rationale, source, status, and change record.
4. `FIRM_POLICY`: loaded from the Desk-owned policy registry, never the deal package; mutable only through a named policy-owner action outside result observation.
5. `DETERMINISTIC_CALCULATION`: derived exclusively by declared formulas from admitted inputs.
6. `MODEL_PROPOSAL`: evidence-referenced, advisory, initially `PROPOSED`, and incapable of consequential mutation.
7. `HUMAN_DECISION`: named and timestamped disposition, override, issue resolution, or IC action.

Package files may contain management-represented targets or requested hurdles, but those values are not `FIRM_POLICY` and cannot clear a gate.

The public Growth policy profile is seeded outside the package as `growth-screen-public-demo-v1`, owned by the Illustrative Growth Investment Committee, source `DESK_DEFAULT_UNREVIEWED`, status `DRAFT`, and last-reviewed state `Not reviewed`. Its exact numeric screens are `3.00x` gross MOIC, `25.0%` annualized gross return, `18.0` months recent-runway coverage, `95.0%` ordinary-cohort retention, and `70.0%` reported gross margin. The retention interval must also be twelve months; a shorter interval remains displayed as directional screening evidence but fails the cohort-completeness gate. Parent concentration, gross-margin quality, cap-table and preference completeness, and assumption provenance require separate evidence and cannot clear from these numeric values.

The retained Helios `risk_policy.json` and distribution priors remain byte-preserved but are classified as `ANALYST_ASSUMPTION`, status `UNREVIEWED`, not as firm policy. A Desk-owned draft policy entry separately references the same illustrative `10.0%` loss ceiling for the public screen. The retained risk-lab ceiling control is a labelled policy sensitivity only; changing it cannot revise the canonical gate, policy registry, or decision record.

## Mandatory screening gates

Every supported intake yields an explicit gate result for retention/NRR, gross-margin quality, burn and runway quality, customer concentration, cohort completeness, financing and ownership assumptions, data sufficiency, and assumption provenance. A missing, unsupported, unreviewed, or failed material gate prevents an IC-ready state.

Northstar's complete golden package must continue to reproduce `$15.9M` LTM revenue, `70.0%` gross margin, an `83.6%` opening-cohort retention proxy measured across 11 months, `33.3%` ownership, `3.23x` MOIC, and `26.5%` annualized return within declared rounding. The proxy must not be labeled annual NRR. Its terminal state is `SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED`; the `83.6%` result is a visible concern against the separate annual-NRR screen until an authorized policy owner records an override and rationale. Missing or modified required files continue to yield `NO CALL — PACKAGE INCOMPLETE` and suppress return conclusions.

Helios continues to separate canonical and working assumptions. Its priors and loss ceiling remain analyst or IC-owned, unreviewed synthetic inputs. Sensitivity cells remain interactive. The conclusion remains conditional `HOLD`, not universal truth.

## Required ordinary-user workflow

An unguided visitor can:

1. open a retained deal or create the supported Northstar deal;
2. inspect recognized, excluded, invalid, and missing sources;
3. preview exact supporting excerpts, rows, periods, or cells;
4. distinguish facts, terms, assumptions, policies, calculations, proposals, and human decisions;
5. edit a bounded working-scenario assumption without altering canonical bytes;
6. see deterministic outputs and the decision consequence update;
7. add a private observation or meeting note;
8. create, assign, prioritize, date, update, and resolve a diligence issue with a resolution record;
9. select exact evidence and confirm the model transfer;
10. review an evidence-referenced proposal;
11. accept, reject, or edit it through a named human action;
12. edit memo sections with section-level provenance;
13. save locally, export and re-import deal state, and generate the IC memo.

## Interface contract

- Desktop: compact 208-pixel left navigation; fluid analytical center; 304-pixel sticky decision rail; split document/evidence preview when inspecting lineage.
- Mobile: no root horizontal overflow; route changes and Back/Forward synchronize view and land at top unless an in-page anchor is intentional; decision rail collapses into an accessible summary sheet.
- Deals: table-first view with company, strategy, owner, stage, posture, blockers, last activity, and next action.
- Overview: call and terms strip, decisive drivers, what must be true, downside, current gates, and note composer.
- Financials: canonical versus working scenario, operating trend, value/debt or ownership/dilution bridge, sensitivity heatmap, return distribution, and clickable lineage.
- Diligence: sortable issue worklist, observation timeline, assumption and policy review, plain-language empirical test, and governed model action.
- Documents: source register and search at left; readable excerpt and lineage at right; technical metadata collapsed.
- Memo: editable section blocks, quiet provenance gutter, accepted-proposal diff, save, portable-state, PDF, and print/export controls.
- One restrained disclosure appears at the deal level and in exports. No decorative AI imagery, gradients, glow, generic bento composition, giant hero text, machine-language debris, or repeated role pills.

## Hosted-model contract

- Job types: `COUNTERTHESIS`, `DILIGENCE_GAPS`, or `DRAFT_MEMO_SECTION`.
- Input allowlist: retained synthetic case id, declared job, selected evidence ids, exact excerpts already present in the synthetic public payload, and a user-confirmed transfer digest. No uploaded Northstar bytes are sent during this sprint.
- Limits: no more than eight evidence items, 12,000 UTF-8 input bytes, 1,500 output tokens, one bounded request, no tools, no URL retrieval, and fail-closed schema validation.
- Output: proposal id, job, status `PROPOSED`, claims, evidence ids for every claim, limitations, created time, model family, and input digest. Missing references, foreign ids, oversize content, stale digest, or invalid schema are rejected.
- The endpoint exposes no calculation, policy, assumption, issue, recommendation, approval, or persistence mutation.
- Human action records reviewer name, disposition, timestamp, source proposal id, accepted or edited text, and provenance. Only accepted or edited memo proposals can populate a memo draft section.
- If zero-spend signed-in runtime authority is unavailable, hosted inference is `BLOCKED_AUTHORITY`; deterministic product completion continues and no fake response is presented as live.

## Econometric presentation

Every retained analysis leads with: business assumption tested; finding in plain language; effect on underwriting; what is not established; evidence and population. Estimand, specification, diagnostics, uncertainty, and statistical notation remain available through disclosure. Dynamic Northstar intake makes no econometric claim.

## Verification contract

- Preserve the full Python and deterministic verification matrix on 3.11, 3.12, and 3.13 across existing CI platforms.
- Add unit and Playwright coverage for policy ownership, NRR blocking, complete/incomplete intake, canonical-versus-working isolation, scenario consequences, evidence previews, notes, issue lifecycle, assumption disposition, memo editing, local persistence, portable export/import, proposal governance, hosted endpoint schema and boundary, scroll reset, Back/Forward, and mobile overflow.
- All headline financial values remain bound to existing independent calculations and tolerances. New presentation code cannot redefine a metric.
- Axe reports zero critical or serious findings on tested desktop and mobile routes. Pixel and layout checks cover 1440 by 900 and 390 by 844. PDF and video manifests bind exact source commit and artifacts.
- Claude financial/econometric review, Grok skeptical-investor review, and ChatGPT audit/hiring review have distinct orders. No unresolved critical or high finding is permitted. Reviewer consensus alone never satisfies a deterministic gate.

## Public release contract

After acceptance, integrate through a reviewable branch-to-main path without rewriting history, run default-branch CI, connect Vercel to the public repository, and verify that the canonical URL resolves to the exact public commit. Update repository description/homepage, README, screenshots, PDFs, demonstration, captions, transcript, thumbnail, claims, and links to the same product. Clearly retire or redirect stale Pages content.

The stop state is `PRACTITIONER_TEST_CANDIDATE_READY`, not practitioner validated, enterprise ready, production adopted, or investment accurate.
