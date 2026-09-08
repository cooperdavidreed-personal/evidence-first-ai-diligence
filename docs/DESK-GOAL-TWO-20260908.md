# Goal 2 — workbook-first operating review

Owner: Codex, authorized by Cooper September 8, 2026. Scope: this worktree only (`codex/desk-local-20260907`), preserving inherited changes. Company synchronization pending; no shared operational records changed.

Deliverable: original-name XLSX inspection, explicit cell/period/unit mappings, saved partial operating reviews, source-linked values, human-controlled revision comparison, and an exportable committee working note. Existing fully admitted package and MCP workflows remain the governed path for full underwriting. No paid inference, deployment, or new security/adoption claims.

Acceptance: horizontal and vertical workbook layouts; rejected invalid mappings; cached results disclosed; original bytes retained; revisions cannot replace approved numbers without review; reload recovery; no invented retention or investment returns; source-backed public-record screen.

## Delivered locally

- New Deal now leads with an original-name XLSX workflow. Existing package intake is behind progressive disclosure.
- A bounded XLSX parser preserves original bytes, sheet names, cell addresses, formulas and stored results. Macros/external links, oversized archives and unsupported formula structures fail explicitly. This is not an Excel calculation engine.
- Suggestions support horizontal and vertical revenue/EBITDA layouts. Manual mapping supports other layouts; period labels, actual/forecast status, currency and unit scale require human review. Up to 36 periods; no automatic annualization or retention/IRR inference.
- Approved operating reviews persist in a separate browser IndexedDB store. Reopen them through New Deal → Saved workbook reviews. Source bytes and review history remain available for download.
- Revised workbook comparison distinguishes cell/formula/cached-value changes. Rejection preserves approved values; acceptance creates the next version. A committee working note derives only from the approved version.
- Snowflake public-record screen now links directly to source documents, labels comparison periods, calculates displayed growth from disclosed rounded inputs, and explains metric interpretation, contrary considerations and next committee action.
- Complete-package tests now explicitly open the advanced path. The durable revision test reads SQLite through the local API when workstation mode is active instead of incorrectly assuming browser storage.

## Verification

- 234/234 unit tests across 37 files.
- Workbook-first approve/reload/reject/accept/committee journey: Chromium and WebKit passed, including final styling rerun.
- Intake/library browser group: 6 passed, 2 local-store-dependent skips.
- Existing workbench/revision desktop regression group: 50 passed, 6 skips.
- Additional fresh disposable SQLite test: 2/2 Chromium checks, including source archive replay and revision-to-committee reconciliation. No user database used.
- MCP protocol/store tests: 20/20. Package tests: 6/6.
- TypeScript + Vite build and case-chunk budgets passed. Large data-chunk warning remains.
- Inspected local intake via in-app browser and saved browser screenshots of the operating review.
- Native Excel/ChatGPT/Claude clients were not rerun. Prior native proof is not promoted to fresh verification.

## Boundaries and next integration

This is an operating-review entry point, not universal spreadsheet underwriting. The new browser-local review store is separate from the canonical full-deal SQLite/MCP workspace. Progressive enrichment into that workspace, shared deal-register listing, backup/import of complete workbook-review histories, and concurrency conflict handling remain work. Existing complete-package controls are preserved; no unsupported partial record is forced into their return calculations. Browser storage is origin-specific and not an enterprise persistence guarantee.

Public-record source passage highlighting remains incomplete: the SEC index confirmed the September 14 document path, but full text retrieval hit tool size limits and direct retrieval returned 403. No fabricated page anchors or excerpts were added. Sources: https://www.sec.gov/Archives/edgar/data/1640147/0001628280-20-013518-index.htm and its linked snowflakes-1a2.htm.

No deployment, account changes, paid inference, enterprise-security or practitioner-validation claims. Current local preview remains http://127.0.0.1:4198/. Distribution is unsigned and requires Node 24+. Goal 1 artifacts retained; new proof is under verification/goal-two-20260908.
