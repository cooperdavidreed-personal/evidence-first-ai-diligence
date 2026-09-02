# Underwriting Desk v0.2.0 — practitioner-test candidate

Status: `PRODUCT SOURCE AND DEPLOYMENT VERIFIED — FINAL FILM REPAIR IN PROGRESS`

This release unifies the former Underwriting Intelligence Lab and Underwriting Desk into one finance-native decision workspace, one repository, and one canonical URL.

## What changed

- Northstar intake can no longer authorize itself through uploaded thresholds. Its reproducible 83.6% opening-cohort retention proxy spans 11 months and is not annual NRR; it is blocked from clearing the separate 12-month annual NRR screen and keeps the complete package at `SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED`.
- Missing or changed required files fail closed with `NO CALL — PACKAGE INCOMPLETE` and no return conclusion.
- Source facts, deal terms, analyst assumptions, fund policy, deterministic calculations, model proposals, and named human decisions remain separate.
- Editable scenarios update returns and decision consequences without overwriting the canonical case.
- Notes, qualitative observations, issue ownership and resolution, assumption disposition, exact evidence preview, memo editing, local persistence, and portable deal-state export/import work end to end.
- AtlasGrid and Helios retain deterministic PE and growth mechanics, econometric interpretation, sensitivities, partner-grade PDFs, and separate technical appendices.
- The hosted adapter sends only a confirmed evidence subset, validates cited output, creates `PROPOSED` language, and requires a named human to accept, reject, or edit it.
- The interface uses a compact institutional shell, full analytical workspace, persistent decision rail, split source preview, plain-language analytical interpretation, and responsive mobile behavior.
- The reported mobile scroll-position defect has a dedicated passing browser regression.
- Canonical decision conditions remain visible even when a human closes a corresponding worklist task; editable issue status cannot rewrite the investment record.
- Complete imported packages that miss deterministic MOIC or annualized-return screens now receive `HOLD` rather than a generic screening-complete posture.
- Helios' 18.0-month policy threshold is explicitly a post-close modeled-runway floor, separate from the 17.3-month recent pre-financing runway shown in the case.

## Verified state

Exact product source `b7eaf6de16ec6a1a7221fd71d6c155720c7061de` is deployed from GitHub `main` through the Vercel GitHub App as production deployment `dpl_4RHjGFxP7LubC9QizMMPJyLyUEkA`. Local replay passes 115 frontend/API tests and the Vite build. The complete GitHub matrix for the exact commit is still completing its macOS lanes; the unchanged Python/kernel surface remains bound to the prior 189/189 complete run until that exact matrix closes. The hosted public challenge returned a structured cited proposal from `openai/gpt-5.4-mini` for the exact selected retention evidence and did not mutate calculations, policy, assumptions, issues, recommendation, or approval. See [`LOCAL-VERIFICATION.md`](LOCAL-VERIFICATION.md).

The first source-bound film passed Claude Fable 5.1 and ChatGPT review but received a Grok `QUALITY_SHORT` verdict with two high-severity findings: model review was presented as differentiation and the film showed insufficient underwriting depth. A replacement 88-second contract leads with AtlasGrid's deterministic returns and decision consequence, then demonstrates evidence, human judgment, bounded model challenge, disposition, and memo output. The final artifact must pass all three exact-film reviews before publication.

## Release gates still open

- Replacement-film capture and exact Claude, ChatGPT, and Grok review with no unresolved critical or high finding.
- Final GitHub release publication, anonymous asset checks, and the review email.

Practitioner results remain `NOT RUN`; the repository includes a participant card, moderator protocol, and feedback template without simulated outcomes.
