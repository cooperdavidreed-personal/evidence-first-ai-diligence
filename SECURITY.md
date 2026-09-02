# Security policy

The public Underwriting Desk accepts only the included fictional or synthetic records and the narrowly declared Growth SaaS Quick Package v1. Do not upload credentials, customer records, private-company documents, material non-public information, proprietary employer data, or confidential deal materials.

## Current controls

- Source rooms reject traversal, symlinks, non-regular files, digest drift, post-cutoff records, oversized files, and bounded prompt-injection patterns.
- Browser intake validates exact roles, sizes, digests, fields, cutoff behavior, and arithmetic before admitting a deal.
- Portable deal import replays the bounded source payloads and rejects case identity, manifest, calculation, or workspace-integrity drift.
- Firm policy is separate from uploaded company/deal files. Model proposals cannot mutate calculations, assumptions, policy, issues, recommendations, or approvals.
- The hosted model adapter accepts same-origin, size-limited, digest-bound synthetic evidence challenges, verifies every submitted evidence item against an independently retained server registry, and returns structured cited proposals only. No provider key is stored in the browser.
- A managed Vercel firewall rule limits `/api/challenge` to five requests per IP in 600 seconds. The function's in-memory window is defense in depth only; same-origin checks do not authenticate a user, and the forwarded address is not treated as identity.
- Portable JSON preserves proposal text and named human disposition but deliberately demotes provider identity to `source unverified` on import. The public browser-local release does not claim cryptographic model-origin attestation.
- The local MCP surface exposes read and proposal tools only; optional ledger writes are explicit, local, digest-bound, and operator-controlled.

These controls do not establish enterprise security, identity, multitenancy, encryption, data-loss prevention, regulatory compliance, confidential-data readiness, or immunity to prompt injection. Browser-local state may be readable by anyone with access to that browser profile.

## Reporting

Do not post a suspected vulnerability with sensitive details in a public issue. Use the repository's private vulnerability-reporting channel if enabled; otherwise contact the repository owner privately through the verified GitHub profile before disclosure.
