# Underwriting Desk — next five increments

Local implementation on `codex/desk-local-20260907`, rooted at 7722cc0e54641f744569829c34c7d280274773ae. All work remains uncommitted in the owned worktree. No push, merge, deploy, account changes, provider charges, or publication.

## Implemented

1. Source delivery archive: explicit local SQLite archival of admitted package bytes, immutable records, SHA-256 verification, and deterministic replay before opening. Available from Deals in the local workstation. Analyst workspace data remains separate and is not exposed by archive tools through MCP. Restoring uses the existing single local-deal slot; it is not a multi-deal database migration or source-version merge.
2. Local launch distribution: `pnpm desk:package` builds a portable ZIP including the production application and allowlisted runtime modules, with file checksums and macOS/Windows entrypoints. Node 24+ remains required. No node_modules or private store included. The extracted HTTP runtime was tested; native launcher UI behavior remains unverified.
3. Scenario comparison: PE/VC tables show selected case, comparison case, and signed differences for return, multiple, and relevant debt/ownership/cash measures. Percentage differences use percentage points; cents convert to dollars. No transaction mechanics changed. Differences are not causal attribution.
4. Proposal queue: status counts, awaiting/accepted/rejected filters, and text/reviewer search. Named human decisions and stale-evidence checks remain in force. Filtering does not modify proposal state.
5. Financial desktop visual pass: task navigation, focusable financial sections, structured comparison tables, restrained borders and typography, plus aligned proposal/archive controls. Original design guided by structured analytical-interface principles; no competitor assets or code copied.

## Verification

- 159/159 Vitest tests passed across 22 files.
- 19/19 Node runtime/MCP tests passed, including archive origin guards and exact-byte readback.
- 2/2 packaging tests passed: archive hashes/exclusions, symlink rejection, extracted runtime without node_modules.
- Desktop Chrome standard run: 34 passed, four skipped (two mobile-specific cases; two local-only cases).
- Local-only runs: proposal review/filter/search/human decision/reload passed; archive restoration after clearing browser storage passed. Total desktop checks passed: 36.
- TypeScript and production build passed; chunk budget check passed. Oversized retained case chunk warnings remain.
- `git diff --check` passed.
- Initial all-suite local-mode run was interrupted: a browser-storage recovery test is specific to static mode. Standard and local-only tests were then run in their appropriate modes as recorded above.
- Python, WebKit, actual model-client onboarding, native launchers, and real Excel application save cycles were not exercised in this increment.

## Review artifacts

Preview: http://127.0.0.1:4198/#/v3/atlasgrid/financials

Screenshots in repository-root `dist`: `financial-review-atlasgrid-1440.png`, `financial-review-helios-1440.png`, `local-review-1440.png`, `local-review-1728.png`.

Distribution: `dist/local-distribution/underwriting-desk-local.zip` (60 files; 3,856,965 bytes).
SHA-256: `95b7d8e76f39b990e965c8b73f704038b76efe1abae7831c83908c0c3924c273`.

## Next acceptance priorities

Prove existing-subscription onboarding with an actual supported Claude client and ChatGPT client separately; document their distinct capabilities instead of promising a universal automatic connection. Test a real Excel export/edit/save/import cycle without weakening controlled-workbook validation. Exercise launchers on a clean Mac and Windows machine. Consolidate repeated financial metrics and test the full evidence-change-to-committee-action demonstration with practitioners.

This is a local, synthetic research demonstration with deliberate governance mechanics. It is not validated enterprise software, a hosted authenticated multi-user service, or evidence of firm adoption. No API bill is required by this local workflow; users supply their own compatible model subscription and computer. Packages remain explicit backups on the same machine, not off-device disaster recovery.
