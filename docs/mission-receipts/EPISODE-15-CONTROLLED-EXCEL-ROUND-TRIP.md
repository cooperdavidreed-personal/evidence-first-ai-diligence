# Episode 15 — Controlled Excel round trip

Status: `PASS — LOCAL SYNTHETIC`

## Result

The admitted Northstar workbook can be exported with one reserved `Underwriting Desk` results worksheet and re-imported for a fail-closed package comparison. The application does not write into any original worksheet.

## Control proof

- All original worksheet OOXML entry bytes remain byte-identical.
- Source formula count remains 28 before and 28 after.
- Only the workbook manifest, workbook relationships, content types, and one newly added worksheet may differ.
- Re-export refuses a workbook that already contains the reserved results sheet.
- An unrelated or unreadable workbook returns `FAIL`.
- The visible diff does not mutate the canonical deal, policy, assumptions, or recommendation.

## Verification

- Vitest: 124/124 passed across 14 files.
- Production TypeScript/Vite build: passed.
- Playwright desktop browser flow: real download, re-import, visible `PASS`, byte/formula assertions, Axe scan, and root-overflow check passed.
- Reviewed visual: `dist/visual-candidates/desktop-mixed-package-documents.png`.

## Boundary

This proves a controlled local round trip against the included synthetic workbook. It does not prove arbitrary Excel-model compatibility, Excel calculation-engine parity, confidential-data readiness, or enterprise document governance.
