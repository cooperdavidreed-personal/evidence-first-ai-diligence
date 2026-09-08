# Underwriting Desk — ten follow-on increments

Local implementation only in `<repository>`, branch `codex/desk-local-20260907`, base `7722cc0e54641f744569829c34c7d280274773ae`. Accumulated work remains uncommitted. No release branch changes, push, deployment, account configuration, paid provider requests or publication.

## What changed

1. Client-specific setup guidance and downloadable setup kit: Claude Desktop JSON fragment, ChatGPT STDIO fields, Codex TOML and tailored assistant instructions. Local paths are identified as private; downloads do not install configuration.
2. Connection diagnostics distinguish unavailable service, absent contact, recent contact, earlier contact and invalid times. A recorded handshake is never presented as authenticated identity or live tool access.
3. Portable launcher preflight checks the manifest, required files, paths, sizes and hashes before importing the service. `--check` verifies without opening a browser, HTTP listener or database. Extracted-process readiness, failure and shutdown cases are exercised.
4. Excel cell review now filters by change kind and searches sheet, address and formula, with progressive access beyond 100 matching changes. Read failures and size limits are visible; formulas are not evaluated.
5. Full Excel cell-review JSON download includes all changes, even when the visible table is filtered, and explicitly records that no human approval or source promotion occurred.
6. Source-only backups can be downloaded and imported through Import deal. The checksum-bound envelope contains admitted source payload only; import replays calculations and preserves existing analyst workspace records. It does not initialize a blank analyst workspace. Backups are distinct from full workspace export.
7. Archive usability adds company search, source identity disclosure, loading/retry states and separate action failures. No fake empty archive is shown after a failed request.
8. Deal register gets company/question search, strategy filtering, clear empty-state recovery and reduced explanatory clutter. Local archives now sit inside the main workspace rather than outside the page. Supporting methodology is disclosed on demand.
9. Financial comparison rows now open exact source traces; duplicate KPI cards are removed. PE minimum liquidity remains inspectable and comparable. Accepted revised values never link to a prior-version metric as if it were the revised source. Reduced-motion preference is honored by navigation.
10. Evidence layout gains adjustable inspector width, compact rows and reset. Preferences survive reload separately from deal state; no financial assumptions or approvals change with presentation settings.

## Integration research

Current official [ChatGPT MCP documentation](https://learn.chatgpt.com/docs/extend/mcp) describes desktop Settings → MCP servers → Add server, including STDIO, and separates hosted web tools. [Claude's local MCP documentation](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) describes local setup and custom extensions. These document available routes; actual account, client-version and workspace-policy compatibility remains unverified on this candidate. No universal automatic setup is claimed.

## Native Excel boundary

The installed Excel app opened a disposable copy of the synthetic operating model with all expected sheets and no observed repair warning. Original bytes were unchanged. The native edit/save cycle was not run: the live-control skill requires a connected document session, and this installation lacked the signed-in ChatGPT add-in. See `EXCEL-NATIVE-VERIFICATION-20260907.md` for the exact observation and instruction. No account or add-in configuration was changed.

## Design recommendation

Use an investment workpaper as the primary interface and a committee brief as its output. The remaining need is a coherent component and interaction standard plus practitioner observation, not more decorative features. Detailed alternatives, acceptance criteria and a concrete reference packet Cooper can supply are in `DESK-DESIGN-DIRECTION-20260907.md`.

## Remaining product limits

The local archive still opens one admitted-deal slot. Restoring an older source does not merge versions; incompatible existing workspace records retain the normal recovery boundary. Source backups are not full workspace backups. Local model tools are deliberately proposal-only; live account roundtrips remain unverified. Launchers require Node24+ and are unsigned. Windows native launch, full WebKit regression, native Excel edit/save, multi-user permissions, enterprise deployment, and practitioner validation remain open. Oversized retained-case build warnings remain. No production security or adoption claims are made.

## Verification

Final results recorded after the final build below.

- 167/167 Vitest tests passed across 25 files.
- 19/19 runtime/MCP tests passed.
- 6/6 portable-package tests passed, including actual extracted launcher subprocesses.
- Desktop Chrome standard run: 35 passed, four applicability skips (two mobile, two local-only). Local review and archive flows both passed separately; archive flow additionally rerun with actual source-backup download/import. 37 distinct desktop checks passed.
- TypeScript and production build passed. Chunk budget checks passed (shell gzip171,861 bytes); large retained-case chunk warnings persist.
- `git diff --check` passed.
- Final local ZIP:61 files,3,862,509 bytes; SHA-256 `0a73eb18cfab448aac50a9cf25bbf4c8c61719664cda9214102423715310bf9a`.
- Preview serves final built assets at http://127.0.0.1:4198/.
- Screenshots in ignored repository-root dist: `desk-ten-register-1440.png`, `desk-ten-evidence-1440.png`, `desk-ten-financials-local-1440.png`.

- Focused WebKit run:4/4 passed (evidence workflow, setup modal, PE/VC finance navigation, saved layout preference). This is not a complete WebKit regression suite.
