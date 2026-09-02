# Underwriting Desk v0.1.0 — practitioner-test candidate

Status: `PRODUCT SOURCE VERIFIED — FINAL PUBLIC REBIND IN PROGRESS`

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

## Verified locally

Exact product source `ebb2b8c4fe4db33224613e22ff4ccfd7f2fa2874` passed 189 Python/kernel tests, 111 frontend/API tests, 9 MCP tests, 38 active browser journeys, 40 visual baselines, six normalized PDFs, and the 414-file public/security scan. A production-equivalent Vercel build emitted only `api/challenge`. See [`LOCAL-VERIFICATION.md`](LOCAL-VERIFICATION.md).

## Release gates still open

- Vercel GitHub App installation for this single repository.
- Vercel AI Gateway payment-method verification and one successful live Claude Fable 5.1 proposal roundtrip.
- Source-bound 75–90 second ElevenLabs demonstration and independent Claude, ChatGPT, and Grok film reviews.
- Final demo/PDF publication, GitHub release, exact-main Git deployment, public smoke test, and review email.

Practitioner results remain `NOT RUN`; the repository includes a participant card, moderator protocol, and feedback template without simulated outcomes.
