# Episode 02 — investor experience

State: `PRODUCED`

## Scope

- Replaced the laboratory-first shell with `Underwriting Desk`.
- Product root is Deals. In-deal navigation contains exactly Overview, Financials, Diligence, Documents, and IC Memo.
- Default decision surfaces use committee language. Reproduction paths, format contracts, hashes, and statistical notation are behind collapsed disclosure.
- The illustrative-data boundary remains visible as a quiet chip and explicit footer language.
- Retained case JSON, data validators, finance engines, econometric receipts, and Python source were not changed.

## Deterministic evidence

- React/data-contract tests: `17/17 PASS` across two files.
- TypeScript compilation and Vite production build: `PASS`.
- Built case chunks remain separate; Vite reported large retained case chunks as a warning, not a build failure.
- The missing `corepack`/`pnpm` launcher in the current shell was bypassed only for verification by invoking the already-installed locked project binaries directly. No dependency was downloaded or changed.

## Boundaries

- Desktop/mobile browser evidence: `NOT RUN` in this episode.
- Automated accessibility/overflow scan: `NOT RUN` in this episode.
- Deal intake remains a declared empty state; it is not yet functional.
- Model workflow and MCP surface remain `NOT IMPLEMENTED`.
- Deployment and practitioner testing remain `NOT RUN`.

The part stays `PRODUCED` until the ordinary browser flows and accessibility checks pass on the integrated slice.
