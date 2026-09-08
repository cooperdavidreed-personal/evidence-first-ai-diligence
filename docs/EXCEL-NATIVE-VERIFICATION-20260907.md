# Native Excel verification — September 7, 2026

**PASS — native connected edit, Excel save, recalculation, and Desk saved-workbook comparison completed.** This supersedes the missing-add-in blocker recorded below.

The signed-in ChatGPT pane and exact disposable workbook were confirmed in Microsoft Excel. The connected session read the three existing used ranges, then changed only `Operating Model!B5` from 1,000,000 to 1,010,000. Excel recalculated B7 gross profit from 700,000 to 710,000 and B9 adjusted EBITDA from -190,000 to -180,000. Native `workbook.save` succeeded. Post-save connected reads showed only those three value changes; formulas and number formats were preserved across the inspected used ranges. No additional sheets or business approvals were created. The workbook remains open.

Original fixture SHA-256 remains `a286d616d9dfc95d745bc7ea7acc84c277047e64800dcbd6d911a49c0a3fd9b5`. Native-saved disposable copy SHA-256 is `9d77febf00cc78ec0f17765d30f91dc3bb3ba64c3a22dd09d51288175b3edeaf`.

## Compatibility defect found and repaired

The first Desk comparison correctly refused the native save because Excel had compacted repeated formulas into shared-formula groups. The cell comparator now expands a bounded arithmetic A1-reference grammar using the declared master and relative position, preserving absolute/mixed references. It rejects missing/duplicate masters, out-of-range followers/translations, and unsupported expressions. Shared formulas containing functions, names, strings or sheet references, plus array/data-table formulas, remain unsupported. No formula evaluation was added. Reference: [Microsoft CellFormula documentation](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.cellformula?view=openxml-3.0.1).

After the fix, the real Desk Documents → Compare saved workbook action reported exactly B5 VALUE_CHANGED and B7/B9 CACHED_VALUE_CHANGED, with zero FORMULA_CHANGED events and no added/removed sheets. The downloaded JSON review retains humanApproved=false. The browser test used isolated browser-local fixture state, not the user's durable live deals. A narrow layout repair also gives the comparison table the full work-surface width.

This proves the selected native workbook path, not arbitrary Excel compatibility or automatic source promotion. The strict controlled-export byte check remains separate from the semantic comparison used after an intentional native edit/save.

## Current verification and receipts

- Vitest: 198/198 passed, including 21 cell-comparator cases.
- TypeScript, Vite production build, case chunk verifier, and actual browser native-file comparison: PASS.
- Original workbook unchanged; native copy edited and saved through the connected Excel session.
- `dist/excel-native-verification/native-live-verification.json`
- `dist/excel-native-verification/native-first-comparison.json` — initial unsupported result, preserved.
- `dist/excel-native-verification/native-save-cell-review.json`
- `dist/excel-native-verification/native-save-browser-result.json`
- `dist/excel-native-verification/native-save-desk-comparison.png`

## Historical setup inspection (superseded)

# Native Excel verification — September 7, 2026

Status: **PARTIAL — native open verified; edit/save roundtrip BLOCKED by live-control setup.**

## Scope and observed result

Microsoft Excel opened the disposable synthetic copy at `dist/excel-native-verification/operating_model-native-test.xlsx`. The title and window URL confirmed that exact copy. Excel displayed the three expected sheets: Read Me, Operating Model, and Budget & Pipeline. The Read Me sheet displayed Northstar Metrics — synthetic operating model. No repair warning appeared during opening. This verifies native opening of this fixture, not formula correctness or an Excel save cycle.

The original fixture is `workbench/public/sample-package-v2/operating_model.xlsx`. Original and verification-copy SHA-256 before and after inspection:

```text
a286d616d9dfc95d745bc7ea7acc84c277047e64800dcbd6d911a49c0a3fd9b5
```

Only the disposable workbook was opened and closed. No cell was edited, no save was invoked, and no preexisting workbook was altered. Excel was left on its start screen. Opening the copy added it to Excel's ordinary recent-files list. No account, permission, installation, paid model, or deployment action was performed.

## Precise blocker

The Home ribbon had no ChatGPT button. Home → Add-ins → More Add-ins → MY ADD-INS displayed:

> Sign in with your account to use add-ins from the Office Store.
>
> No Add-ins

The applied live-control skill at `<user-home>/.codex/plugins/cache/openai-primary-runtime/spreadsheets/26.905.11957/skills/excel-live-control/SKILL.md` requires connected-document tools for workbook reads and writes and explicitly states: “do not ... edit workbook cells through Computer Use.” It also requires the ChatGPT add-in to be installed, open, signed in, and registered before live editing. This inspection reached the missing-add-in/sign-in gate. The skill forbids silently switching to an alternate cell-editing automation route.

Therefore the intended native cell edit → Excel save → semantic comparison was **NOT RUN**. No parser test or untouched-copy comparison is presented as native save evidence.

## Next verification once live control is available

Use a fresh disposable copy; confirm its exact window title; read an input cell using the connected session; edit one supported numeric input; save that copy through the connected session; close only that workbook; verify the original hash; run the actual `workbook-diff.ts` semantic comparison on the original and saved copy. Record formula changes separately from cached-value recalculation and the deliberate input edit.

The missing add-in can be installed from the official Microsoft Marketplace listing, `https://marketplace.microsoft.com/en-us/product/office/WA200010215`, or through Excel's Add-ins search, verifying publisher OpenAI, LLC. Installation and sign-in were not attempted in this session.
