# Structured review and local workstation implementation

This continues the authorized September 7 implementation in `codex/desk-local-20260907`, starting from the preserved Claude design candidate `7722cc0e54641f744569829c34c7d280274773ae`. It supersedes the earlier first-slice implementation status in `DESK-LOCAL-20260907.md`. No public release, source case data, financial engine, deployment, or external account was changed.

## Product changes

The investment case now opens with a structured evidence matrix, an adjacent selected-evidence inspector, a concise current view, the opposing case, and committee/financial/diligence actions. Selecting a measure preserves its context while opening exact source lineage. A diligence question created in the inspector retains its evidence reference and owner. A model-review action carries the selected measure into the review workflow.

The desktop navigation is Investment case, Changes, Financials, Diligence, Documents, and IC Memo. Changes exposes AtlasGrid's existing deterministic revision workflow directly. Local admitted packages have their own revision and workbook-comparison controls there. Helios has no fabricated revision fixture: its Changes screen explains the available financial-scenario and local-package paths.

The previous detailed analysis remains available through an explicit supporting-analysis disclosure. The repeated permanent decision rail becomes optional Decision context. Source and financial controls remain functional. The visual direction uses structured, bordered work surfaces, restrained blue selection, readable tabular data, and an adjacent inspector rather than a collection of generic cards. New desktop labels were increased to at least 12px after the regression suite caught smaller text.

The design uses principles documented in [Hebbia's Matrix introduction and linked demonstration](https://www.hebbia.com/blog/introducing-matrix-the-interface-to-agi). No proprietary layout, code, imagery, or brand assets were copied. No skyline asset was installed.

## Model connection

The primary setup screen has three actions: choose an existing desktop app, copy an assistant setup prompt, and check the connection. The local service detects the actual workbench path, review-store path, and Node executable; users do not have to type these paths. Manual launch configuration remains inspectable.

The generated prompt permits an assistant with access to the user's actual computer to configure only the Desk MCP entry, preserve other entries, back up edited configuration, restart the client with explanation, list tools, and verify contact from the Desk. It explicitly distinguishes local computer access from a remote browser/sandbox and does not request broad permissions, disable controls, extract subscription credentials, purchase usage, or create a public endpoint.

Current official documentation supports [Claude local MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) and [ChatGPT desktop MCP settings](https://learn.chatgpt.com/docs/extend/mcp). Client version and workspace policy still matter. [ChatGPT web uses a separate connector path](https://developers.openai.com/plugins/deploy/connect-chatgpt); the product does not imply that editing local configuration connects a web chat. This implementation generates setup assistance and verifies recorded MCP initialization, not a universal one-click installer or a tested automatic configuration in every client.

Connection status is a timestamped client handshake, with a self-reported client name. It does not claim authenticated model identity, a currently online client, or completed model reasoning. No paid model API is needed by this local architecture; existing subscriptions and their usage limits remain the user's responsibility.

## Local persistence and runtime

The built workbench runs through a standalone loopback Node service. Vite remains available for development. Both use the same HTTP review and workspace handlers. Setup information, selected evidence, and proposals use the local SQLite review store. Analyst workspace state uses separate current-state and append-only revision tables with transactional version comparison.

Only an empty local workspace record permits migration of a validated browser copy. Existing local records take precedence. Loading and saving still run the existing deal-specific scenario, evidence, proposal, and integrity validation. Concurrent stale saves return a conflict; editing pauses and the unsaved copy can be downloaded before reloading. A failed explicit local runtime does not silently fall back to browser persistence. Queued writes drain across internal navigation, and unsaved local writes trigger a browser-close warning.

The public static build keeps browser persistence. Private notes are not exposed by the model-review tools. HTTP routes enforce the local Host/Origin/custom-header boundary. Static serving is limited to the built assets; traversal, escaping symlinks, dotfiles, and source maps are rejected. These are local application controls, not enterprise identity, tenancy, tamper-proof logging, or security certification.

Source-package payloads still use the existing browser-managed intake store. Therefore this is durable analyst-workspace persistence, not a claim that every source byte and approved deal version has migrated into one database.

## Excel comparison

The controlled export and its strict worksheet-byte/formula preservation check remain unchanged. A separate saved-workbook comparison now resolves sheet names and cell addresses and distinguishes input values, ordinary formulas, cached formula results, and added/removed cells and sheets. It tolerates supported packaging and shared-string differences instead of treating every Excel save as changed financial content.

Comparison is bounded to supported `.xlsx` structures and size limits. Shared, array, and data-table formulas, external-link/macro packages, and ambiguous structures are rejected. It does not calculate formulas or claim full workbook equivalence, chart/style/name validation, or a completed roundtrip through a real Excel application. Differences are for review and do not automatically update the approved case.

## Run and review

From this worktree's `workbench` folder, with Node 24 or newer and the locked dependencies installed:

```sh
pnpm build
pnpm desk:start
```

The default URL is `http://127.0.0.1:4198`; the default database is `~/.underwriting-desk/reviews.sqlite`. `DESK_PORT` and `DESK_LOCAL_STORE` can override them. The running task preview uses a separate temporary database. Keep the process running while using the Desk. The unpublished candidate must be provided locally; cloning the current public release does not include these changes.

Review the investment matrix, open a source, assign a diligence question, navigate to Changes, and inspect a returned proposal. Open Connect model for the assistant setup prompt and detected settings. The prompt is generated locally and is not automatically sent anywhere.

## Remaining external proof and implementation boundaries

Still required: a real supported Claude/ChatGPT client setup and model roundtrip, an actual Excel save-cycle test, source-package migration, a distributable novice-friendly launcher/installer, and practitioner observation. Broader uploaded-package PE/VC modeling must stay within tested financial contracts. Do not market this as an enterprise-ready product or claim firm adoption or investment performance.

The useful career demonstration remains a revised evidence delivery changing an investment argument, with deterministic consequences, inspectable sources, and a human-controlled conclusion. The product should be assessed on that complete workflow rather than on its feature count.

## Verification

- React/Vitest: 154/154 passed, including Excel semantic differences, local workspace migration/conflicts, hydration pause, native browser-fetch binding, and generated setup guidance.
- MCP/runtime: 15/15 passed, including local HTTP boundaries, static file serving, independent process/store visibility, proposal-only tool surface, durable workspace transactions, and revision conflict rejection.
- Existing desktop Chromium workbench and memo suite: 31 passed; two existing mobile-only skips. Financial, human-disposition, stale-memo, source-lineage, controlled Excel, minimum-text-size, overflow, accessibility-scan, and PDF assertions were retained.
- New analytical-workspace browser tests: 2/2 passed. Source inspection preserves context; a newly assigned evidence-linked diligence question persists; setup guidance is accessible.
- Local-runtime browser test: 1/1 passed using a disposable database and separate stdio MCP process. It verifies evidence preparation, returned synthetic proposal, named acceptance, saved state after reload, and recorded client initialization.
- Built standalone app loaded in Chromium on port 4198, hydrated a durable workspace, and detected actual setup paths. Screenshots inspected at `dist/standalone-investment-case.png` and `dist/standalone-model-setup.png`; matrix captures at 1440 and 1728 widths are also retained in this lane's ignored `dist/` directory.
- TypeScript, production build, chunk-budget check, and diff whitespace checks passed. Existing oversized case-chunk build warning remains.

The live browser test found a native `fetch` receiver bug that mocked transport tests missed. It was repaired, a regression test was added, and the browser flow was rerun successfully. Python and WebKit were not run in this increment. A synthetic model fixture is not a live provider session; generated workbook fixtures are not an actual Excel application save cycle. All changes remain local and uncommitted.
