# Underwriting Desk architecture

Underwriting Desk is a synthetic public reference product with three layers:

1. **Deterministic analytical kernel** — Python generates and validates content-addressed synthetic source rooms, accounting, transaction mechanics, econometric results, scenarios, and analysis receipts.
2. **Canonical deal workspace** — React loads validated runtime projections, preserves the admitted case separately from bounded working scenarios, and stores human notes, diligence, assumption dispositions, proposal reviews, and memo edits browser-locally.
3. **Replaceable advisory models** — a small hosted adapter and a local proposal-only MCP surface may challenge selected evidence or draft memo language. They cannot write canonical finance, source facts, fund policy, assumptions, recommendations, or approvals.

## State and authority

```text
synthetic source package
        ↓ validation and replay
admitted source facts / deal terms
        ↓ deterministic methods
canonical calculations and screening gates
        ├── bounded working scenarios (unapproved)
        ├── analyst notes and diligence records (named humans)
        └── selected evidence → model proposal → named human disposition
                                                   ↓ accepted language only
                                                editable IC memo
```

Company evidence, deal terms, analyst assumptions, fund policy, deterministic calculations, model proposals, and named human decisions use separate contracts. Uploaded company files cannot define the policy that grades them. Every working scenario remains distinguishable from the admitted case.

## Public runtime

- The Vite application is static except for the bounded `/api/challenge` serverless function.
- Retained-case payloads are lazy-loaded and validated before rendering.
- Supported Northstar intake and portable deal-state import are replayed and recomputed before admission.
- Browser storage is local, unauthenticated, and unsuitable for confidential information.
- The hosted model request is same-origin, size-limited, rate-limited, digest-bound, and restricted to a confirmed synthetic evidence subset that must match the server-retained registry for the exact deal. Provider credentials remain server-side. Same-origin is a browser boundary, not user authentication.
- Portable workspace import preserves proposal content and named human disposition but strips model-family attribution and labels provider origin unverified; the public slice does not claim cryptographic provider attestation.
- The local stdio MCP server has read and proposal tools only. Optional proposal-ledger writes are operator-enabled and do not alter the case.

No route can trade, spend, contact a company, approve an investment, or make a model proposal canonical without named human action. Deterministic verification proves internal behavior on synthetic fixtures; it does not prove real-deal accuracy, production security, or investment outcomes.
