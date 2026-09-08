# Underwriting Desk: sixteen-step implementation closeout

September 7, 2026. Local worktree: `<repository>`, branch `codex/desk-local-20260907`, based on `7722cc0e54641f744569829c34c7d280274773ae`. Accumulated work remains uncommitted. Public source, release, and deployment were not changed.

## Product and completion standard

Underwriting Desk is an evidence-change review workspace for PE and VC underwriting: inspect a source, test its economic consequence, record a human disposition, and prepare a reconciled committee argument. It complements subscription model applications and Excel. It does not replace relationship CRM, sourcing databases, arbitrary financial modeling, or institutional identity/security infrastructure.

This pass targets a coherent desktop research demonstration with working state and controls. “Complete” below means implemented and locally exercised for that scope, not enterprise certification or practitioner validation. Native client and Excel acceptance are separate gates; software tests cannot substitute for those workflows.

**Updated closeout:** all sixteen local-demo increments are complete within their stated boundaries. ChatGPT workflow acceptance is Cooper-confirmed; Claude and native Excel have independent tool evidence. Native Excel verification found and repaired shared-formula save compatibility. This is local demonstration completion, not enterprise production readiness. See EXCEL-NATIVE-VERIFICATION-20260907.md for the latest 198-test result and exact supported workbook scope. Original batch counts below remain historical.


## Implementation register

| Step | Delivered result | Acceptance / boundary |
|---|---|---|
| 1. Scope and definition of done | Narrow evidence-to-committee job, explicit completion gates, preserved deterministic calculation and human ownership. | This register defines the finished local increment and unresolved external proof. |
| 2. Carbon-informed tables | Shared semantic review table across deal register, evidence, diligence, source changes and Excel differences; sortable headers, row labels, selected state, numeric alignment and empty results. | Unit keyboard/sort behavior and actual browser journeys. Carbon principles, original styling; not Carbon component adoption/certification. |
| 3. Visual system | Neutral canvas, graphite rail, restrained blue, consistent review spacing/typography and controls, consolidated root palette and working component specimen. | `/#/design-system`; inspected desktop screenshots. Legacy component CSS remains; this is not a complete CSS rewrite. |
| 4. App shell | Deals root now shares the product's navigation rail and work-surface language; clear intake/model actions. | Root plus retained-case six-destination browser journeys. |
| 5. Evidence review | Structured investment matrix with adjustable source inspector, search, density and selection; diligence assignment retains context. | Source tracing, issue creation and persistence verified. |
| 6. Source preview | Friendly document names, exact retained excerpt/rows in context, selected passage styling, source location and calculation behind disclosure. | Source opening and keyboard return to opener verified. Does not claim arbitrary PDF page highlighting. |
| 7. Financial work areas | Compare cases, capital/cash, sensitivities, VC loss, value creation and optional full view; area deep link persists without replacing scenario. | PE/VC comparison, section navigation, reload and scenario consequence checked. |
| 8. Investment argument | Current view, why it could work, opposing case, must-be-true conditions, downside variables, remaining diligence and next committee action. | Retained synthetic buyout/venture arguments; baseline clearly distinguished from later scenarios. |
| 9. Multiple deals and versions | Immutable saved-source library and durable local archive; latest/all-version view, search, reopen, source integrity and replay. | Two same-name packages reopen independently in Chrome/WebKit. Browser quotas still apply; local archive listing capped at 100 deliveries. |
| 10. Resumable intake | Explicit save/resume/discard of partial source selection using IndexedDB; previous additive picker and version admission preserved. | Exact bytes survive reload; incomplete package stays blocked; no analysis or approval saved with draft. One draft, 8 MB limit. |
| 11. Evidence change | Before/after evidence table, deterministic consequences, stale memo work and reopened diligence, named disposition history. | V1→V2 acceptance, memo stale/reconcile/export journey passed. |
| 12. Diligence queue | Search/filter/sort by actionable fields; selected issue review, owner/status/due/resolution controls, distinct blocking queue. | Creation, retained ownership after invalid edit, resolution, persistence and canonical-condition separation verified. |
| 13. Model review | Submitted/current evidence, edited versus original language, explicit accept/reject, provenance, missing/stale reference blocks, linked memo use. | Local MCP subprocess→browser→human review→reload and mocked hosted transport contracts verified separately. |
| 14. Subscription model connection | Guided client setup, local detection and read/propose-only MCP. Actual Claude subscription read→cited proposal→Desk inbox passed; proposal remained unapproved. | See `CLIENT-READINESS-20260907.md` for exact local configuration and one-time tool consent. ChatGPT workflow is user-confirmed; CUA inspection remains restricted. Do not claim universal subscription onboarding. |
| 15. Excel handoff | Controlled XLSX export/import, supported formula/input/cache differences, review table and source byte checks preserved. | Native Excel edit/save/reimport passed, including one input edit and two cached recalculations; original source preserved. See exact skill restriction in `EXCEL-NATIVE-VERIFICATION-20260907.md`. |
| 16. Committee freeze | Detached JSON packet binds memo/scenario/workspace revision and selected review records, checksum, pending IC status; stronger common export reconciliation gate. | Real browser download and checksum verification in Chrome/WebKit; unit checks for stale/empty/blocked content. No signed approval or authenticated identity claim. |

## Verification

- React/Vitest: **187/187 passed**, 30 files.
- Runtime/MCP: **19/19 passed**.
- Native Claude Desktop: **PASS**, one synthetic selected-evidence read and one cited model proposal through the existing subscription, zero incremental API spend. Not a universal-client or fresh-machine result.
- Portable-package tests: **6/6 passed** (separate extracted launcher and file-integrity checks).
- Main Chrome suite: **37 passed, 4 skipped**, 41 discovered. The skipped items are two mobile-only cases and two tests requiring an explicit local SQLite runtime.
- Main WebKit suite: **29 passed, 12 skipped**, 41 discovered. Existing Chrome-only acceptance gates remain skips; not represented as WebKit proof.
- Added component keyboard/empty state, financial-area reload, and frozen committee download: **6/6 passed**, three per browser.
- Explicit local SQLite browser acceptance: **4/4 passed**, two per browser, isolated databases and serial workers.
- An initial local browser run incorrectly shared one SQLite store across four workers; WebKit encountered a disabled acceptance control after a competing revision. Isolated reruns passed. This is test-fixture interference, not evidence that conflicting writes are silently allowed.
- TypeScript and Vite production build: **PASS**. Case chunk isolation/budgets: **PASS**. Shared static chunks are now included in transfer accounting. Shell gzip 180,100 bytes; AtlasGrid initial gzip 402,515 bytes; Helios 355,806 bytes.
- Vite still warns about large case-data chunks. No claim that all performance work is finished.
- Existing automated accessibility checks found no serious/critical issue on scanned Chrome states. This is not WCAG certification or a complete assistive-technology audit.
- Python was not rerun: no Python files changed in this pass. Native Windows launch and multi-user production deployment were not exercised.

## Visual evidence and review

Current built preview: `http://127.0.0.1:4198/`. Preview and Claude now share the durable user-local store `<user-home>/.underwriting-desk/reviews.sqlite`; SQLite backup integrity and retained rows were verified, and the original temporary store was preserved. Claude configuration was backed up before additive setup and before changing the store path. Representative artifacts in ignored local output `dist/sixteen-implementation/`: `deals-1440.png`, `evidence-1440.png`, `evidence-1728.png`, `financials-1440.png`, `diligence-1440.png`, `components-1440.png`. Source and case-specific browser evidence also remain in existing verification output.

The design applies IBM Carbon's public table principles (https://carbondesignsystem.com/components/data-table/usage/) and Hebbia's structured analytical-workspace principle. No competitor source, private layouts, skyline images or branding were copied. No image asset or paid design service was purchased.

## Remaining release and product gates

1. Completed locally: ChatGPT workflow user-confirmed; native Excel edit/save/reimport independently verified. Never label subprocess fixtures as actual frontier-model work.
2. Cooper walkthrough plus one PE and one VC task-based review: inspect a number, change evidence, challenge it, resolve a blocker, export the committee argument. Record confusion and failures; do not invent practitioner endorsement.
3. Scope any production version separately: authenticated identity, role-based access, multi-user conflicts/authority, confidential-data isolation, encryption/key management, deployment operations, backups/restore objectives, monitoring and support. These are intentionally not claimed by this zero-incremental-cost local demo.
4. Before any public replacement, review this local candidate and decide release scope. No push, merge, deployment or publication occurred.

## Career-facing statement

Defensible description: “Built a local PE/VC underwriting workspace combining deterministic transaction models, evidence-linked analysis, versioned source review, governed MCP model proposals, controlled Excel handoff and scenario-bound committee exports.” Add actual client proof only as documented. Do not claim firm adoption, investment performance, enterprise security, universal model compatibility, or practitioner validation.

For the next visual review, Cooper's highest-value input is a short walkthrough of this candidate describing where he hesitates, plus three annotated public-product screenshots or official demo timestamps showing preferred table density, evidence-panel behavior and decision-action placement. The working product is now concrete enough for that review; another broad theme or generic “make it enterprise” prompt is unlikely to improve it as much.

Portable candidate: `dist/local-distribution/underwriting-desk-local.zip`, SHA-256 `7d353466d51b199c943814f95ce156372f24e5193f92027c584bb609844637d2`. Extracted launcher preflight passed with 63 files verified and no database created. See `DESK-SIXTEEN-VERIFICATION-20260907.md`.

Latest portable ZIP after the native-save fix: SHA-256 `63174b36d4cab13fdc23784a5d6794ec02f0debd25d258dd62a0ccdd51d74482` (3,876,537 bytes). It supersedes the earlier ZIP hash above.
