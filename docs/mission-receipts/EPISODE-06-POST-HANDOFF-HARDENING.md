# Episode 06 — post-handoff hardening

Recorded: `2026-09-01T15:44:50Z`

State: `VERIFIED`

## Scope

Close three noncritical robustness findings from the exact-candidate Claude review without changing the Python kernel, retained cases, finance mechanics, econometric results, source rooms, or public-claim boundary.

## Product commit

- Parent: `85a09ace69dd7e5a8d9a23106a3e45a51731b6b7`
- Initial hardened product: `57d74c13331f1fc82bdb99bc0ca0d73fa68e80f0`
- Exact hardened product after independent-review repair: `2f1ead6f08ff5ecc9c112a3eb8db674ef2042524`
- Writer: Codex only

## Changes

1. Retained-analysis contract failures now render a readable `Analysis unavailable` boundary and suppress analytical conclusions instead of blanking the view.
2. Empirical result headings, badges, decision-use language, and negative/positive/neutral descriptions derive from the retained estimate sign rather than assuming a negative effect.
3. Id-less MCP `tools/call` notifications are dropped before execution so they cannot create an invisible proposal or emit an invalid JSON-RPC response.
4. Claude independently reviewed the initial hardening source with zero writes and returned `NO_UNRESOLVED_CRITICAL_OR_HIGH_FINDING`; its two actionable lower findings were repaired before the exact final integrated gate.

## Exact-head verification

Command: `UNDERWRITING_SKIP_PYTEST=1 bash scripts/verify-underwriting.sh`

- Mutation/source-room/analysis/coverage/memo/recovery gates: `PASS`
- Frontend/data/intake/model: `39/39 PASS`
- MCP: `6/6 PASS`
- TypeScript/Vite build and lazy chunks: `PASS`
- Browser: `18 passed`, `6 intentional mobile print skips`, `24 discovered`
- Visual: `40/40 PASS`
- Accessibility records: `8/8 PASS`
- PDFs: `6/6 PASS`
- Visual manifest: `PASS`
- Public scan: `PASS` over `352` candidate files before this receipt

Python/kernel bytes are unchanged from the immediately preceding full `182/182 PASS` run; that result is reused only for byte-identical Python/kernel scope.

## Remaining boundary

Vercel deployment and hosted ordinary-user verification remain `BLOCKED_AUTHORITY`. No login or account repair was performed. Grok final-verdict credit remains `HELD_PROVIDER` under the exhausted mission ceiling.
