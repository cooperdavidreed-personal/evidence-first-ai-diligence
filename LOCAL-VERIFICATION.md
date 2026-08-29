# Local verification receipt

Status: `LOCAL CANDIDATE — INDEPENDENT REVIEW PENDING`

Exact base: `f00c4ecdfe7691c23b24a8f7d1d0ab5408984909`

Candidate head: recorded in the final mission receipt after the independent review and repair pass.

Environment: macOS, Python 3.11–3.13, Node 22, pnpm 11.19.0, Chrome. Hosted CI on Ubuntu/macOS remains `NOT RUN` until a separately authorized push.

## Current local results

- Full Python suite: 52/52 passed independently on Python 3.11, 3.12, and 3.13.
- Evidence-kernel deterministic regression: 24/24 declared outcomes matched.
- Underwriting contract suite: 17/17 passed.
- Seeded synthetic recovery ledger: 15/15 checks passed across six runs. This tests recovery against planted synthetic truth, not real-world investment accuracy.
- React unit suite: 3/3 passed; TypeScript and Vite production build passed.
- Playwright: 4/4 complete case/viewport flows passed. Each flow covers all five views, case/scenario switching, econometric toggles, sensitivity, keyboard lineage open/Escape/focus return, per-view root overflow, and per-view serious/critical axe scans.
- Visual evidence: 20 current screenshots bind five views, two cases, and 1440×900 plus 390×844 viewports in `verification/visual-evidence.json`.
- Public-tree scan: 122 candidate files, zero findings.
- Ruff passed; Bandit found zero medium/high-severity issues.
- Locked Python dependency audit and pnpm high-severity audit found no known vulnerabilities.
- Wheel and source distribution built; a clean Python 3.11 wheel install discovered both CLIs and all packaged underwriting schemas.
- Workbench compilation rejects stale top-level digests, nested receipt tampering, orphan lineage, and unbound outputs.
- The prior static slide demo remains `QUALITY SHORT` and is not the portfolio demo.

## Provider and review state

- Claude product/econometrics advisory specifications: `PRODUCED` and frozen before result generation.
- Grok reference red team: `HELD_PROVIDER` after the retry ceiling; partial output is not verified research or case evidence.
- Claude investment/econometrics review: `PENDING`.
- Claude final independent acceptance: `PENDING`.

## Boundaries

These results establish local behavior of the named synthetic bytes. They do not prove semantic truth, real diligence accuracy, production reliability, comprehensive WCAG compliance, public availability, hiring impact, investment performance, or enterprise adoption. CoreWeave, FinanceBench, FinRank, Fin-RATE, hosted CI, publication, résumé wording, and human investment adjudication remain `NOT RUN` or outside this mission.
