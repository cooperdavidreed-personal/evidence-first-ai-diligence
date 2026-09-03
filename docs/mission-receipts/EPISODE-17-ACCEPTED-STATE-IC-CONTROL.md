# Episode 17 — Accepted-state IC control

Status: `PASS — LOCAL SYNTHETIC`

## Result

Version promotion now preserves the immutable V1 analytical origin used to validate the human workspace. A V2 result changes the current evidence snapshot without erasing prior notes, dispositions, issue history, or memo review state.

## Acceptance proof

- Candidate V2 marks the three material assumptions, the change issue, and three memo sections stale.
- Reject and defer preserve V1.
- Named acceptance alone promotes V2 and archives V1 deal, analysis, file receipts, and original source bytes.
- IC export remains blocked after promotion until a named editor reconciles affected memo sections.
- The downloaded memo identifies the accepted V2 evidence and includes the 78.6% revised cohort result; the superseded 83.6% result is absent.
- A human observation recorded under V1 survives promotion, reconciliation, and page reload.
- Reload validates the workspace against its immutable V1 analytical origin while rendering current V2 deterministic results.

## Verification

- Vitest checkpoint: 126/126 passed.
- Desktop Playwright V2 journey: intake, V1 approval, human note, V2 import, reject, defer, accept, stale-assumption state, blocked IC export, named reconciliation, downloaded-file assertions, original-source history, and post-reload note preservation passed.

## Boundary

This proves the included browser-local synthetic workflow. It does not establish multi-user concurrency, external identity authentication, confidential-data controls, or institutional approval authority.
