# Episode 13 — mixed-format admission and Version 1

State: `VERIFIED`

## Coherent result

The public intake now supports a source-preserved `growth-saas-evidence-package/v2` containing:

- a manifest with exact byte counts and SHA-256 digests;
- deal terms kept separate from Desk-owned policy;
- an imperfect XLSX operating model;
- a customer/cohort CSV; and
- a text-bearing PDF management update.

The browser parses the declared operating-model sheet, recognizes the eligible monthly period, maps only supported financial rows, excludes a post-cutoff forecast and unrelated sheet, rejects the seller-style adjusted EBITDA row from calculations, checks gross-profit arithmetic, and reports the number of formulas preserved in the original workbook. PDF text is extracted by page and classified as a management representation. Scanned-image OCR, chart interpretation, and unsupported workbook structures fail closed or remain explicitly excluded.

Validation alone no longer creates a canonical workspace. A named human analyst must record a rationale approving the recognized mappings and exclusions as Version 1. The approval digest is bound to the manifest. It does not approve company claims, analyst assumptions, fund policy, screening posture, or an investment decision.

Portable deal state retains the exact XLSX and PDF bytes as base64 payloads and deterministically replays them before restore. The Documents view exposes downloads of the exact admitted binary sources. The legacy four-file package remains replay-compatible but is no longer the primary public sample.

## Public synthetic fixture

- `workbench/public/sample-package-v2/operating_model.xlsx`
- `workbench/public/sample-package-v2/customer_arr.csv`
- `workbench/public/sample-package-v2/management_update.pdf`
- `workbench/public/sample-package-v2/deal.json`
- `workbench/public/sample-package-v2/manifest.json`

The workbook and PDF were visually inspected after generation. The workbook contains formula-driven gross profit and adjusted EBITDA rows; the latter is deliberately excluded pending QoE support. The PDF contains only fictional Northstar Metrics content.

## Verification

- `pnpm test -- --run`: `121/121 PASS` across 13 files.
- `pnpm build`: `PASS`; PDF parsing and its worker are lazy-loaded outside the default application bundle.
- Desktop Playwright admission regression: `3/3 PASS` for legacy intake, incomplete-package fail-closed behavior, and mixed XLSX/CSV/PDF admission with refresh/replay.
- Dedicated mixed-format Playwright journey: `PASS`, including recognized scope, preserved formulas, cutoff exclusion, gross-profit reconciliation, PDF page scope, named approval, visible Version 1 record, source preview, and browser-local restore.
- `pnpm audit --prod --audit-level=high`: no known vulnerabilities.
- Package build output contains all five sample files with the manifest-declared byte counts.

## Limitations and next state

- The parser intentionally accepts one clearly named operating or financial model sheet; arbitrary workbook layouts and OCR are not claimed.
- The source workbook is preserved and downloadable, but controlled Excel result export and workbook re-import diffs are not yet implemented.
- Version 2 admission and local change propagation are not yet implemented.
- Claude and Grok remain `HELD_PROVIDER`; this episode has deterministic Codex implementation evidence but no independent provider verdict.

Proceed to local Version 2 change detection, impact propagation, and accept/reject/defer handling while preserving the approved Version 1 bytes.
