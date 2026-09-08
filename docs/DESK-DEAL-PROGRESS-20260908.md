# Deal progress implementation

Owner: Codex. Cooper explicitly approved the complete deal-progress plan. Exact scope: evidence-first-ai-diligence-desk-local-20260907, branch codex/desk-local-20260907, inherited HEAD 7722cc0 and accumulated edits preserved. No other writer identified in this checkout. Company synchronization pending; no shared runtime admission or account changes.

Outcome: unified uploaded-company record, source-addressable evidence and mapping, persistent findings/diligence, version-bound MCP proposals and outputs; local recovery/access/deletion controls; verification and packaged pilot. No push, deployment, paid inference or external messages. Native managed Windows/Claude Enterprise verification depends on the actual permitted device and account and cannot be manufactured locally.

Implementation in progress. Tests use disposable stores, never the user's existing reviews.sqlite.

## Integrated candidate delivered — September 8

The local candidate now creates a durable company immediately from its name, strategy, stage and investment question. New company rows share the main Deals register with the existing PE/VC examples. Uploaded-company navigation is Brief, Review, Model, Evidence and Committee. Earlier standalone workbook review remains available under progressive disclosure; migration retains source bytes and earlier decisions and requires explicit confirmation of legacy period basis.

Canonical `desk.deal-progress/v1` records live in the existing local SQLite database, with immutable original sources, compare-and-swap saves, adopted findings, linked questions/assumptions, source decisions and version-bound outputs. Intake accepts arbitrary filenames and incomplete material sets. Explicit financial definitions separate currency/scale, dates, actual/forecast, reported versus adjusted EBITDA and source cells. Removed metrics are missing, not zero; changed definitions are not presented as comparable changes. Cached Excel formulas are inspected, never recalculated or executed.

MCP adds investment-review discovery, paginated released evidence/context and cited work proposals. The analyst selects current and, where relevant, prior approved sources. Source version/status remain explicit. Unreleased sources and uncited private notes are excluded. Proposals are tied to the release digest; old releases are revoked on workspace saves. Adopt selected proposals as a batch. Models cannot call company save, approve evidence, change deterministic calculations or make investment decisions. Diligence proposals can carry why/next action; memo proposals become an editable partner-update draft awaiting reconciliation.

New evidence preserves the baseline, shows mapped changes, marks linked findings for review and reopens affected resolved diligence. Accepted narrative additions conservatively flag findings rather than pretending deterministic semantic understanding. Analysts reconcile current, contradicted and unsupported views. Changes to findings, diligence, assumptions or the review mandate stale outputs. Screening, management questions and partner updates come from the same record; citations use source names and locators. Partner updates use the previous saved event boundary. Text export, browser Print / Save PDF and separate XLSX changes are available.

A loopback/same-origin/session-token API protects the new private-record endpoint against ordinary cross-origin web access. This is not user authentication against someone controlling the device account. Encrypted backups use scrypt plus AES-256-GCM. Company deletion removes its canonical record, source bytes, release and proposals; downloaded/provider/backup and retained legacy-browser copies remain separate. No forensic erasure or enterprise security certification is claimed.

## Verification

- React/Vitest: **240/240 passed**, 38 files.
- Node MCP/store/HTTP: **26/26 passed**.
- Packaging tests: **6/6 passed**.
- New integrated Chromium/WebKit workflows: **4/4 passed**. Real local MCP subprocess used by a synthetic test client; not Claude Enterprise.
- Existing desktop regressions: **76 passed / 16 conditional skips**, covering existing deal navigation, PE/VC workspaces, memo, review, workbook and archive paths. This regression run preceded the final bounded output-label/release-history/UI refinements; the new integrated flows and unit/store tests were rerun after those refinements.
- TypeScript and production build passed. Chunk budget check passed; Vite still warns about the large lazy case/PDF chunks. No budget was raised.
- Actual ZIP extracted into a temporary path with spaces and exercised: integrity check, launcher, authenticated private API, packaged MCP retrieval/proposal and encrypted backup/delete/restore passed with disposable synthetic data. Runtime used Node v26.3.0; minimum-Node checks are covered, but this does not prove every Node 24 runtime/device combination.
- Test data stayed in disposable stores. The user's live DB was not used to seed test companies. The owned local service on port 4198 was restarted to activate the backend and opened in the browser.
- Python was not rerun: no Python source changed. New native Excel export opening, native Claude Enterprise on the target machine, managed Windows installation and independent practitioner use are **NOT RUN**.

Evidence: `verification/deal-progress-20260908/` contains desktop screenshots, build/test logs and `package-exercise.json`. Reproduction: from workbench run `pnpm test`, `pnpm test:mcp`, `pnpm test:package`, `pnpm build`, `pnpm verify:chunks`; run `tests/deal-progress.spec.ts` with DESK_LOCAL_STORE set to a disposable database. Package with `node scripts/package-local.mjs`; verify extracted runtime with `node scripts/verify-progress-package.mjs`.

## Material remaining gaps

This is the first integrated local pilot candidate, not a completed enterprise rollout. Managed-device installation and Claude policy are external dependencies. It does not provide firm-wide roles, SSO, collaborative multi-user state or an application-encrypted live database. The local subscription route avoids Desk-operated inference costs; it does not override provider usage limits.

Input bounds remain 8 MB/file, 10,000 populated XLSX cells and 100 PDF pages; no OCR or DOCX. Large data rooms need a later storage/retrieval design. Context is intentionally source-scoped; uncited notes are not automatically released. Every workspace save revokes the release, which is safe but adds review-batch friction. Narrative dependencies rely on citations and analyst/model interpretation; they are not semantic proof. Uploaded-company operating comparisons do not automatically connect arbitrary workbooks to the existing example transaction engines. Browser PDF saving depends on the workstation print dialog. Source inspection still has density limits that need practitioner feedback with real permitted materials.

No push, merge, deployment, spending or external communication occurred. Existing unrelated local changes remain intact. Company synchronization remains pending. Next required evidence is the independent workstation pilot described in `docs/DESK-ANALYST-PILOT-20260909.md`.
