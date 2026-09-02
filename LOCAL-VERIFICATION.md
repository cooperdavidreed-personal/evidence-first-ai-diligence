# Local verification receipt

Status: `EXACT PUBLIC PRODUCT VERIFIED — FINAL FILM REPAIR AND RELEASE REMAIN`

- Verified product-source commit: `b7eaf6de16ec6a1a7221fd71d6c155720c7061de`
- Working release branch: `codex/underwriting-v020-release`
- Product merge: PR 21 into `main`
- Environment: macOS, Python 3.12.13, Node 26.3.0, Chromium
- Complete Python-bound command at unchanged Python source `ebb2b8c`: `bash scripts/verify-underwriting.sh`
- Exact frontend replay at `b7eaf6d`: `cd workbench && npm test -- --run && npm run build`
- Updated: `2026-09-02` America/Chicago / UTC

## Exact complete gate

- Python/kernel: `189/189 PASS` in `652.70s` at `ebb2b8c`; `git diff --quiet ebb2b8c..c974440 -- '*.py' pyproject.toml uv.lock` returned `PASS`, so no Python source, dependency, or lockfile byte changed before the exact-candidate replay.
- Mutation gates: `PASS` — 16 declared, 13 dynamic, 1 static; whole-program score `NOT_CLAIMED`.
- AtlasGrid deterministic room: `PASS` — 11 files, 9,987,885 bytes.
- Helios deterministic room: `PASS` — 15 files, 823,353 bytes.
- Frontend, intake, persistence, policy, hosted-adapter, and data contracts: `115/115 PASS`.
- Local MCP boundary: `9/9 PASS`; read and proposal-only surface preserved.
- TypeScript/Vite build and lazy chunks: `PASS` — shell gzip 118,323 bytes; AtlasGrid payload 203,215 bytes; Helios payload 156,506 bytes.
- Browser: `40 passed`, `8 intentional skips`, `48 discovered`; all active desktop and mobile journeys passed.
- Mobile route regression: `PASS`; a scrolled Deals page opens the selected deal at the top.
- Visual regression: `40/40 PASS` on the declared macOS reference platform.
- Accessibility evidence: `8/8 PASS`; no retained critical or serious automated Axe finding and no root overflow. This is not comprehensive WCAG certification.
- PDF contract: `6/6 PASS`, 36 pages total, tagged and metadata-normalized.
- Visual manifest: `PASS`.
- Public artifact, secret, and private-path scan: `PASS` over 415 candidate files.
- Dependency and security contracts: `PASS`; no known package vulnerability reported by the configured checks.

## Decision-integrity proof

- The complete Northstar sample reproduces $15.9M LTM revenue, 70.0% gross margin, an 83.6% opening-cohort retention proxy measured across 11 months, 33.3% post-money ownership, 3.23x gross MOIC, and 26.5% annualized gross return.
- Its uploaded thresholds do not become fund policy. The 83.6% proxy is not labeled annual NRR; its 11-month interval is `BLOCKED` from clearing the separate 95% 12-month screen, and the posture remains `SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED`.
- Missing or modified required files suppress returns and produce `NO CALL — PACKAGE INCOMPLETE`.
- Canonical cases remain separate from unapproved what-if scenarios, analyst assumptions, fund policy, model proposals, and named human decisions.
- Resolving a human diligence worklist item cannot erase a canonical decision condition; the rail reports canonical conditions and editable worklist items separately.
- A complete package that misses deterministic MOIC or annualized-return screens receives `HOLD`; package completeness alone cannot produce a more favorable posture.
- Helios separately records the selected 20% analyst catastrophe prior and the 20% seeded replay loss frequency. Only the selected prior is screened against the separate 10% Desk ceiling; the replay is disclosed as a generator check, not an independent estimate.
- Helios' 18.0-month threshold is labeled as a post-close modeled-runway floor and remains distinct from the displayed 17.3-month recent pre-financing runway.
- Human notes, issue workflow, assumption review, source previews, memo editing, portable state, and proposal disposition all passed ordinary browser journeys.

## Hosted and public state

- Canonical URL: `https://underwriting-desk-delta.vercel.app/`.
- Git-backed production deployment: `dpl_4RHjGFxP7LubC9QizMMPJyLyUEkA`, status `READY`, target `production`, GitHub source `main` at exact SHA `b7eaf6de16ec6a1a7221fd71d6c155720c7061de` with verified commit metadata.
- Managed Vercel firewall: `rule_synthetic_model_challenge_rate_limit_SOKNGR`, live at five `/api/challenge` requests per IP per 600 seconds.
- A production-equivalent Vercel build emits exactly one serverless function, `api/challenge`, and includes declared CSP, HSTS, frame, content-type, referrer, and permissions headers. The public scan fails if another file enters the auto-discovered API directory.
- The public server validates the exact evidence digest and fails closed. A live Northstar retention request returned HTTP 200 from `openai/gpt-5.4-mini` with the exact request digest, cited retention-only challenges and gaps, and an explicit no-mutation limitation. The project retains a non-renewing $1 usage budget; observed Gateway consumption during verification was approximately $0.02 of included credit and no provider key is exposed to the browser.
- First-film mechanical verification: `PASS` — 84.0 seconds; 1920×1080; 30fps; 16 SRT and 16 VTT cues; nine review frames; 67 source files; −17.45 integrated LUFS; −0.94 dBTP; H.264/AAC; exact SHA-256 `8cc8495e099f4d8617d0dd2d276a745157a94c3458aa222865a4af223de5befb`.
- First-film review: Claude Fable 5.1 and ChatGPT returned `PASS`, but Grok returned `QUALITY_SHORT` with two high-severity findings. The replacement contract addresses both by leading with AtlasGrid's deterministic seller-ask sensitivity and treating model review as secondary. Exact replacement-artifact review is `NOT YET RUN`.

## Not established

- Observed PE, VC, CFO, or recruiter usability: `NOT RUN`.
- Real-company accuracy, investment performance, firm adoption, arbitrary data-room support, confidential-data readiness, enterprise security, authentication, or multitenancy: `NOT CLAIMED`.
- Exact-main GitHub matrix: `PASS` on Ubuntu and macOS for Python 3.11, 3.12, and 3.13, plus workbench, security, toolkit, Vercel, and Pages gates (run `33649431083`).
- Three-reviewer film acceptance, GitHub release, anonymous release-asset checks, and final review email: `NOT YET COMPLETE`.

This receipt is committed after the verified product-source commit because a Git commit cannot contain its own final SHA. The receipt commit changes documentation only; final GitHub CI must still bind the eventual public merge commit.
