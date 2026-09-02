# Episode 01 — isolation and product contract

State: `VERIFIED`

## Immutable lane

- Mission: `underwriting-product-vertical-slice-20260901`
- Mission SHA-256: `374c6a781b94576e42a21d15d76973836aa2d74469c676371c4643f8f2064452`
- Worktree: this isolated repository checkout (exact host path retained only in non-public mission evidence)
- Branch: `codex/underwriting-product-vertical-slice`
- Exact base: `5795f00fe7466991605dfba95b7d0d3b90cde5bd`
- Initial worktree state: clean before the frozen contract was written

## Provider evidence

- Scrubbed native CLI presence probe: Codex `0.150.0`, Claude Code `2.1.250`, Grok `1.0.5`.
- Claude architecture order: read-only, `PRODUCED`, output SHA-256 `e71d7342b9e28bfd0f434ca0f22d3b89b09f2a001ebde1150a6b59c278e7f407`, verdict `BUILD_CONTRACT_READY`.
- Grok first order: read-only, `FAILED_RETRYABLE`; no completion credit.
- Grok bounded retry: read-only, `PRODUCED`, output SHA-256 `90c6b7f8579a1ef197c4425bef59c0f60a3de035bd3c87536f7f3c6efbce5b0b`, verdict `BUILD_CONTRACT_READY`.
- Presence is not login, capacity, reservation, independent verification, or billing proof. Provider metadata can report list-price-equivalent usage; no API-key fallback was used and no separately billed marginal charge is inferred from that metadata.

## Frozen implementation contract

- Contract: `docs/PRODUCT-VERTICAL-SLICE-CONTRACT.md`
- Contract SHA-256: `cbdcbb53fa6f2b13dee0c14e82f029ff0d8ef7661d6512d7bd8773bc1e6d78a2`
- Product root: Deals; in-deal destinations: Overview, Financials, Diligence, Documents, IC Memo.
- Intake: browser-local Growth SaaS Quick Package v1, explicit file-state ledger, deterministic fail-closed output.
- Model: one evidence-challenge proposal workflow; no canonical finance or recommendation mutation.
- MCP: local read tools and proposal-only writes; no decision or assumption mutation tool.

## Tailwind Plus boundary

Cooper's active Tailwind Plus access was reported as confirmed during contract preparation. No Tailwind Plus or Catalyst bytes were copied into this repository in this episode. If licensed bytes are copied later, their applicable notice must be retained separately from Apache-2.0.

## Limits

- Practitioner testing: `NOT RUN`.
- Vercel authentication, ownership, credentials, and deployment: `UNVERIFIED`.
- This checkpoint is contract evidence, not product acceptance or activation evidence.
