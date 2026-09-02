# Episode 05B — retained product evidence

- Timestamp: `2026-09-01T14:14:04Z`
- Base before this checkpoint: `e9364e1`
- Terminal state: `VERIFYING`
- Writes: this owned isolated worktree only
- External effects: none

## Produced

- Replaced the superseded technical Lab screenshots with a manifest-bound Underwriting Desk proof set.
- Retained the governed print images and normalized PDFs without weakening their byte-level regression checks.
- Bound accessibility records to the current workbench case-data digest and made Pages staging select only manifest-declared records.
- Removed 28 obsolete UI screenshots and four obsolete accessibility records. These deletions are version-controlled and recoverable from git history.

## Exact evidence

- Browser suite during intentional baseline update: `18 passed, 6 skipped / 24 discovered`; all six skips are desktop-only print cases under the mobile project.
- Fresh candidate browser suite: `18 passed, 6 skipped / 24 discovered`.
- Retained visual manifest: `36` product PNGs + `8` accessibility JSON records + `10` print artifacts (`4` PNG + `6` PDF), self-digest `ec6edec6399c09713579134b3c32b52c6f23818e4b091e164ce02f0ea343916f`.
- macOS pixel regression: `40/40` PNG candidates PASS within the retained thresholds.
- Normalized PDF byte regression: `6/6` PASS.
- Accessibility record regression: `8/8` PASS; every tested default surface had zero critical or serious Axe findings and no root overflow. This is automated evidence, not a comprehensive WCAG or practitioner-usability claim.
- Targeted manifest/Pages/public-case tests: `15/15` PASS.
- Manual image inspection covered complete and incomplete intake at desktop, complete intake at mobile, and mobile local-deal Financials; no critical clipping, overlap, or illegibility was observed.

## Still unproved

- The complete repository verification command has not yet passed against one final commit.
- Current independent provider review, push, Vercel deployment, and deployed ordinary-user verification are `NOT RUN`.
