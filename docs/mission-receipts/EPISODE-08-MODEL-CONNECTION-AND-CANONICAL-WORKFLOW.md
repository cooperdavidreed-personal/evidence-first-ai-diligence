# Episode 08 — model connection and canonical decision workflow

Recorded: `2026-09-01T17:45:00Z`

State: `VERIFIED_LOCAL`

Implementation commit: `2688e065491f16142ce08238e2a75dca7bb80373`

## Product question

Why should an investment professional use the Underwriting Desk instead of performing the entire underwriting process inside a general-purpose model workspace?

The answer is implemented as an ordinary workflow, not a marketing claim: the Desk retains the validated package, deterministic finance, policy tests, evidence bindings, proposal disposition, and committee output while the model is replaceable and proposal-only.

## Implemented vertical slice

1. A three-step connection center distinguishes local MCP, hosted remote MCP, and an operator-controlled in-product adapter.
2. Claude Code and Codex receive copyable commands for the included local stdio MCP server.
3. ChatGPT, Claude.ai, and Grok are honestly marked as requiring a hosted authenticated MCP service; the public build does not claim that service exists.
4. The local server can append validated proposals to an opt-in JSONL ledger bound to the deal, manifest digest, analysis digest, and canonical evidence references. The server creates the file with mode `0600` and tightens an existing file to that mode before writing.
5. A retained deal imports that local ledger, rejects malformed or mismatched entries, and forces every admitted item back to `PROPOSED`.
6. A named human accepts or rejects each proposal. Only accepted memo drafts enter the IC memo, and their disposition remains visible.
7. Browser-local deal intake and model-proposal state remain session-only and clear on reload. No provider key is collected in the browser.

## Independent design challenge

Claude performed a read-only product-moat review from checkpoint `740fa62709b66c5c98c88447afc3a259ec95a6c9` with zero writes. Its decisive finding was that a connection wizard alone would be AI theater. It required a complete proposal-ledger-to-human-review-to-memo workflow; that workflow is now implemented and deterministically tested.

Grok was not invoked because the mission's four-order Grok ceiling was already exhausted. Its state remains `HELD_PROVIDER`, not silently reset.

## Exact local acceptance

Command: `bash scripts/verify-underwriting.sh`

- Python/kernel: `182/182 PASS` in `724.25s`
- Declared mutation gates: `16/16 PASS`; dynamic `13`, static `1`, whole-program score `NOT_CLAIMED`
- Frontend unit/data/intake/model/connection: `54/54 PASS`
- MCP: `8/8 PASS`
- TypeScript and Vite production build: `PASS`
- Lazy case-chunk boundary: `PASS`; shell gzip `89,099` bytes; AtlasGrid payload gzip `718,257`; Helios payload gzip `607,795`
- Browser: `22 PASS`, `6` intentional mobile-print skips, `28` discovered
- Visual regression: `PASS`; `40` PNG references
- Accessibility evidence: `8/8 PASS`; automated route evidence only, not comprehensive WCAG proof
- PDF contract: `6/6 PASS`
- Visual manifest and public scan: `PASS`; `364` candidate files at scan time

Two preceding attempts failed only because the host volume exhausted free space while pytest generated synthetic rooms. After deleting disposable pytest, npm, uv, Puppeteer-download, and VS Code updater caches, the same complete command passed. No repository source, retained evidence, credentials, or user documents were removed.

## Honest boundary

- Local MCP is usable with the two retained illustrative cases.
- The supported browser-local intake is the declared four-file Growth SaaS Quick Package, not arbitrary data-room ingestion.
- The in-product adapter proves an endpoint contract, not provider inference quality or production connectivity.
- Hosted remote MCP, authentication, tenant isolation, confidential-data handling, durable collaboration, and firm adoption remain `NOT_IMPLEMENTED`.
- Investment judgment, approval, and suitability remain human responsibilities.
