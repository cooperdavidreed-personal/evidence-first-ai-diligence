# Local verification receipt

Status: `UNIFIED PRODUCT SOURCE VERIFIED — EXTERNAL RELEASE GATES REMAIN`

- Product and demo-source commit: `a7795db151811382d209e288ef006bcbf2363bb8`
- Branch: `codex/underwriting-unified-release`
- Base merge: `5c273bb` (PR 16 into `main`)
- Environment: macOS, Python 3.12.13, Node 26.3.0, Chromium
- Complete command: `bash scripts/verify-underwriting.sh`
- Completed: `2026-09-01` America/Chicago / `2026-09-02` UTC

## Exact complete gate

- Python/kernel: `188/188 PASS` in `661.09s`.
- Mutation gates: `PASS` — 16 declared, 13 dynamic, 1 static; whole-program score `NOT_CLAIMED`.
- AtlasGrid deterministic room: `PASS` — 11 files, 9,987,885 bytes.
- Helios deterministic room: `PASS` — 15 files, 823,353 bytes.
- Frontend, intake, persistence, policy, hosted-adapter, and data contracts: `98/98 PASS`.
- Local MCP boundary: `9/9 PASS`; read and proposal-only surface preserved.
- TypeScript/Vite build and lazy chunks: `PASS` — shell gzip 116,554 bytes; AtlasGrid payload 203,232 bytes; Helios payload 162,906 bytes.
- Browser: `38 passed`, `8 intentional skips`, `46 discovered`; all active desktop and mobile journeys passed.
- Mobile route regression: `PASS`; a scrolled Deals page opens the selected deal at the top.
- Visual regression: `40/40 PASS` on the declared macOS reference platform.
- Accessibility evidence: `8/8 PASS`; no retained critical or serious automated Axe finding and no root overflow. This is not comprehensive WCAG certification.
- PDF contract: `6/6 PASS`, 36 pages total, tagged and metadata-normalized.
- Visual manifest: `PASS`.
- Public artifact, secret, and private-path scan: `PASS` over 412 candidate files.
- Dependency and security contracts: `PASS`; no known package vulnerability reported by the configured checks.

## Decision-integrity proof

- The complete Northstar sample reproduces $15.9M LTM revenue, 70.0% gross margin, 83.6% ordinary-cohort NRR, 33.3% post-money ownership, 3.23x gross MOIC, and 26.5% annualized gross return.
- Its uploaded thresholds do not become fund policy. The 83.6% NRR result breaches the separate 95% Desk policy and the posture remains `SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED`.
- Missing or modified required files suppress returns and produce `NO CALL — PACKAGE INCOMPLETE`.
- Canonical cases remain separate from unapproved what-if scenarios, analyst assumptions, fund policy, model proposals, and named human decisions.
- Human notes, issue workflow, assumption review, source previews, memo editing, portable state, and proposal disposition all passed ordinary browser journeys.

## Hosted and public state

- Canonical URL: `https://underwriting-desk-delta.vercel.app/`.
- Current production deployment: `dpl_32Y12VM5aGWJTT76cLqzBY4X1546`; root and bundled assets return `200`.
- Managed Vercel firewall: `rule_synthetic_model_challenge_rate_limit_SOKNGR`, live at five `/api/challenge` requests per IP per 600 seconds.
- The public server validates the exact evidence digest and fails closed, but Vercel AI Gateway currently returns an account-credit error. A valid payment method is required to unlock the included free credits before live Claude Fable 5.1 inference can be accepted.
- Git-backed Vercel deployment remains blocked until the official Vercel GitHub App is installed for the single repository. A manual deployment is not counted as final Git-backed release proof.

## Not established

- Observed PE, VC, CFO, or recruiter usability: `NOT RUN`.
- Real-company accuracy, investment performance, firm adoption, arbitrary data-room support, confidential-data readiness, enterprise security, authentication, or multitenancy: `NOT CLAIMED`.
- Final ElevenLabs film, three-reviewer film acceptance, GitHub release, exact-main Vercel deployment, and final review email: `NOT YET COMPLETE`.
