# Episode 07 — CI load-boundary repair

Recorded: `2026-09-01T15:57:00Z`

State: `VERIFIED`

## Trigger

GitHub verification run `33524773690` failed only in the `underwriting-workbench` job. The six Python/OS matrix jobs, security contract, and toolkit contract passed. Two React tests timed out while resolving the real multi-megabyte lazy case payload; teardown then produced `ReferenceError: window is not defined` from a late state update.

## Product repair

- Load-boundary source commit: `8633bd0519e3a477a2b2a4a490d795e4b0581d32`
- Exact product commit after accessibility repair: `89798f013d1f15ceba7d16ccc2acf0a4f669a0cc`
- Writer: Codex only
- Production retains the validated dynamic case loader and lazy case chunks.
- The app accepts a typed case-loader boundary so unit tests use an immediate deterministic fixture rather than depending on runner speed.
- A rejected case load now renders `Deal unavailable`, states that no data, assumption, or decision changed, and offers an ordinary return-to-Deals action.
- The new rejection test proves that fail-closed recovery path.
- GitHub run `33528822350` proved the timing repair in CI, then exposed three pre-existing moderate `landmark-unique` findings in the retained desktop records. Informational callouts no longer create duplicate complementary landmarks; the refreshed records contain zero Axe violations.
- Workflow commit `41ce875e1bcb49e6df74926d6911962e35d8b193` adds branch-scoped concurrency so future pushes cancel stale verification runs.

## Deterministic acceptance

Focused CI-mode gate:

- Frontend suite run twice: `40/40 PASS` both times.
- MCP: `6/6 PASS`.
- TypeScript/Vite build and lazy chunks: `PASS`; shell gzip 82,996 bytes; AtlasGrid payload gzip 718,257 bytes; Helios payload gzip 607,795 bytes.

Complete exact-source non-Python gate:

- Mutation/source-room/analysis/coverage/memo/recovery gates: `PASS`.
- Frontend/data/intake/model: `40/40 PASS`.
- MCP: `6/6 PASS`.
- Browser: `18 passed`, `6 intentional mobile print skips`, `24 discovered`.
- Visual: `40/40 PASS`.
- Accessibility records: `8/8 PASS`.
- PDFs: `6/6 PASS`.
- Visual manifest and public scan: `PASS`.

Python/kernel bytes remain unchanged from the complete `182/182 PASS` run. Final GitHub run `33530085943` at candidate parent `a1e7dec88e62b4dca9bdcbf492bfc68e4e98d553` completed `SUCCESS`: all 9 jobs passed, including Python 3.11, 3.12, and 3.13 on Ubuntu and macOS, the workbench, security contract, and toolkit contract.

## Remaining boundary

Vercel deployment and hosted ordinary-user verification remain `BLOCKED_AUTHORITY` because the official CLI is logged out. Grok final-verdict credit remains `HELD_PROVIDER` under the exhausted mission ceiling.
