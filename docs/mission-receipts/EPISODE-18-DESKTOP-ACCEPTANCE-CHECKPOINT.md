# Episode 18 — Desktop acceptance checkpoint

Status: `PASS — LOCAL CANDIDATE`; hosted release `NOT YET VERIFIED`

## Candidate scope

- Mixed XLSX, CSV, PDF, JSON intake with explicit recognition, exclusions, reconciliation and named V1 approval.
- V2 evidence rerun with ranked impacts, stale assumptions/issues/memo, named accept/reject/defer, archived V1, and preserved human observations.
- Controlled Excel results sheet with original worksheet-byte and formula preservation proof.
- Accepted-version IC memo gate and downloaded-content assertions.
- Bounded hosted proposal workflow plus local read/proposal-only MCP surface.
- AtlasGrid and Helios retained deterministic cases.
- Snowflake public-record retrospective with a September 14, 2020 cutoff and explicit hindsight exclusion.

## Verification results

- Python: 189/189 passed.
- Deterministic regression ledger: 24/24 matched.
- React/unit/API contracts: 126/126 passed.
- MCP boundary: 9/9 passed.
- Playwright: 50 passed across desktop Chromium and WebKit; 12 duplicate tests intentionally skipped by desktop-only fixture gates.
- Production build and chunk budgets: passed. Shell gzip 147,114 bytes; AtlasGrid initial gzip 362,558 bytes; Helios initial gzip 315,849 bytes.
- Visual regression: 22/22 desktop manifest-bound PNGs passed after human review of the two intentionally changed intake baselines.
- Normalized PDF byte regression: 6/6 matched.
- Accessibility evidence regression: 4/4 matched; tested surfaces had no critical/serious Axe findings or root overflow. This is not comprehensive WCAG certification.
- Public scan: 444 candidate files passed after manifest-bound review of the two synthetic XLSX fixtures.

## Provider and external state

- Claude and Grok native review remained `HELD_PROVIDER`; no review or consensus is claimed.
- Practitioner observation remains `NOT RUN`.
- Hosted URL, GitHub default-branch integration, deployment binding and live adapter replay remain `NOT YET VERIFIED` at this checkpoint.

## Known limits

- Public synthetic/local workflow only; no confidential-data readiness, authentication, multi-user concurrency, firm integrations or adoption claim.
- Excel parser supports the declared sample contract, not arbitrary institutional models or Excel calculation parity.
- Snowflake public records are incomplete for sponsor underwriting and therefore produce `NO CALL`.
- Existing v0.2.0 film and PDFs remain historical artifacts; no new film was authorized in this run.
