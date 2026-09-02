# Local verification receipt

Status: `PRODUCT CANDIDATE VERIFIED LOCALLY — FOUNDER REVIEW PENDING`

- Exact mission base: `5795f00fe7466991605dfba95b7d0d3b90cde5bd`
- Product candidate commit: `85f379ddbb329354421076f6ae5569058a7c8133`
- Branch: `codex/underwriting-product-vertical-slice`
- Environment: macOS, Python 3.12.13, Node 26.3.0, Chromium
- Complete kernel command at parent `8b3eeb81aee7d8042ebfb38a6c43ced103518321`: `bash scripts/verify-underwriting.sh`
- Exact complete command: `bash scripts/verify-underwriting.sh`
- Exact post-review non-Python command: `UNDERWRITING_SKIP_PYTEST=1 bash scripts/verify-underwriting.sh`
- Complete run date: `2026-09-01`

The current candidate adds the model connection center, local proposal ledger, browser import, named human disposition, memo insertion, and independent-review repairs. Python/kernel, lockfile, retained-case, and source-room bytes are unchanged. The subsequent public deployment evidence is recorded in [`docs/mission-receipts/EPISODE-09-VERCEL-DEPLOYMENT.md`](docs/mission-receipts/EPISODE-09-VERCEL-DEPLOYMENT.md).

GitHub Actions run `33530085943` at candidate parent `a1e7dec88e62b4dca9bdcbf492bfc68e4e98d553` completed `SUCCESS`: all 9 jobs passed, including the Python 3.11–3.13 Ubuntu/macOS matrix, workbench, security contract, and toolkit contract.

## Product evidence

- Product root: **Deals**.
- In-deal destinations: **Overview**, **Financials**, **Diligence**, **Documents**, and **IC Memo** — exactly five.
- Ordinary UI intake: supported four-file package → explicit validation ledger → deterministic analysis → decision review.
- Incomplete input: `NO CALL — PACKAGE INCOMPLETE`, named missing file, no return conclusion.
- Uploaded bytes: in-memory only in the public slice; no observed external request in the tested flow; refresh clears the deal.
- Model workflow: selected-evidence challenge, citation validation, optional local proposal-ledger handoff, named human review, accepted memo output, and honest unavailable states for unimplemented hosted paths.
- MCP: seven reads and three proposal tools; forbidden canonical mutation tools absent; local ledger writes are opt-in, digest-bound, evidence-validated, and mode `0600`.

## Complete local gate

- Python/kernel repository suite: `182/182 PASS` in `724.25s`.
- Mutation gates: `16` declared, `13` dynamic, `1` static; `PASS`; whole-program score explicitly `NOT_CLAIMED`.
- Frontend/data/intake/model/connection: `54/54 PASS` across eight files.
- MCP surface/boundary: `9/9 PASS`.
- Production TypeScript/Vite build: `PASS`.
- Lazy case chunks: `PASS`; shell gzip `89,305` bytes, AtlasGrid payload gzip `718,257` bytes, Helios payload gzip `607,795` bytes.
- Browser: `22 passed, 6 skipped / 28 discovered`; all six skips are desktop-only print tests under the mobile project.
- Visual regression: `40/40` PNG candidates `PASS` on the reference macOS platform.
- Accessibility records: `8/8 PASS`; no tested default surface had a critical or serious Axe finding or root overflow.
- PDF contract: `6/6 PASS`, `35` pages total, all six tagged and metadata-normalized.
- Visual manifest: `PASS`; `36` product PNGs, `8` accessibility JSON records, and `10` print artifacts; manifest digest `d6e151fb150fe58a18bcd09999d8c24836f975c1e277a255da2efcbba7f63df2`.

## Preserved analytical boundary

The verifier regenerated both retained source rooms, analyses, estimator-coverage records, memo/packet/appendix sets, and the frozen recovery ledger. The UI, intake, model proposal path, and MCP layer did not weaken the governed finance, econometric, lineage, source-room, mutation, chunk, PDF, or public-artifact gates.

## Not established by this receipt

- Observed PE/VC practitioner usability: `NOT RUN`.
- Comprehensive WCAG conformance: `NOT CLAIMED`.
- Real-company accuracy, arbitrary data-room support, investment performance, confidential-data readiness, enterprise security, or autonomous investment judgment: `NOT CLAIMED`.
- Runtime provider inference: `NOT RUN` because no runtime endpoint/credential is configured; deterministic workflows and the local MCP ledger handoff remain available.
- Independent Claude model-workflow review at `4c6fe115db9a9fd6a3d57fca073addf3bc87ec1d`: `PORTFOLIO_CANDIDATE_READY`, zero writes, no critical or high finding. All four actionable low findings were repaired in `85f379ddbb329354421076f6ae5569058a7c8133`. Final Grok verdict remains `HELD_PROVIDER` under the exhausted order ceiling.
- Remote push, Vercel deployment, and deployed ordinary-user verification: completed after this local gate and recorded separately; they are not implied by the local counts above.
