# Episode 16 — Public-record cutoff case

Status: `PASS — PUBLIC RECORD RETROSPECTIVE`

## Result

Added a real-company Snowflake pre-IPO evidence screen with a frozen information cutoff of `2020-09-14T23:59:59Z`. The screen admits the August 24 S-1 and September 14 S-1/A, and excludes the September 16 final prospectus and December quarterly filing.

## Decision discipline

- Reported facts, derived calculations, an indicative deal term, and missing private evidence are visibly distinct.
- Each displayed fact links to an admitted SEC filing.
- The final $120 IPO price and later operating results are visibly excluded as hindsight.
- The conclusion is `NO CALL — public record incomplete for a private-market underwriting decision`.
- The product does not manufacture an ownership, dilution, downside, or return model from incomplete public inputs.

## Verification

- Primary sources: SEC EDGAR filing records only.
- Temporal invariant unit tests: 2/2 passed, including planted misclassification rejection.
- Full Vitest suite at checkpoint: 126/126 passed.
- Production build: passed.
- Desktop Playwright: direct route, cutoff, admission/exclusion counts, prohibited-hindsight copy, NO CALL boundary, Axe scan, root overflow, screenshot, and reload passed.
- Visual reviewed: `dist/visual-candidates/desktop-snowflake-public-record-package-cutoff.png`.

## Boundary

This is a historical public-information screen. It is not a sponsor data room, a complete private-market underwriting, a prediction, or an investment recommendation. The SEC pages are linked, not republished.
