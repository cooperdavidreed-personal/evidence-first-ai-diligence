# Episode 03 — supported local-first deal intake

State: `PRODUCED`

## Implemented contract

- Ordinary multi-file browser control for `Growth SaaS Quick Package v1`.
- Required inputs: manifest, deal, monthly financials, and customer ARR.
- Web Crypto SHA-256 and exact byte-count matching before parsing.
- Explicit `READY`, `RECOGNIZED`, `MISSING`, `INVALID`, `UNSUPPORTED`, and `EXCLUDED` file states.
- Explicit supported column-alias mapping; no silent column guessing.
- Integer-cent validation, duplicate-row rejection, cutoff exclusions, safe-integer bounds, and fail-closed package state.
- Deterministic LTM revenue, gross margin, ordinary-cohort NRR, recent net burn, runway, post-money ownership, terminal revenue, exit equity, gross multiple, and annualized gross return.
- Incomplete packages expose no returns and render `NO CALL — PACKAGE INCOMPLETE`.
- Complete packages render only `READY FOR IC REVIEW` or `HOLD` against declared thresholds. Neither is an investment approval or recommendation.
- Selected file objects and derived deal state remain in memory. Refresh clears them; no persistence or network transport is implemented.

## Included supported package

- `deal.json`: 544 bytes; SHA-256 `70efbc25e7e43f137fc2f144ccf148e269289b3a4795f8796a248f780c8a90b2`.
- `monthly_financials.csv`: 548 bytes; SHA-256 `63ba72a1f5a29c987fa57d23142f23c749aba37f9be024af8f86862140a53927`.
- `customer_arr.csv`: 224 bytes; SHA-256 `2a0f6a439c1e1ce5bf965751ef1278165bfaa4ef7b47ddf9458e6f485b9e7b94`.
- `manifest.json` binds those exact bytes.

## Deterministic evidence

- Intake contracts: `8/8 PASS`.
- Total React, data-contract, and intake tests: `26/26 PASS` across three files.
- TypeScript compilation and Vite production build: `PASS`.
- Case-chunk verification: `PASS`; shell gzip 79,980 bytes, AtlasGrid payload gzip 718,257 bytes, Helios payload gzip 607,795 bytes.

## Boundaries

- Ordinary Chromium file-selection and complete/incomplete journeys: `NOT RUN` in this episode.
- The Quick Package is not equivalent to the full retained Python engine and makes no arbitrary data-room, confidential-data, or enterprise-security claim.
- ZIP extraction is not implemented; the supported public control is multi-file selection.
- Model and MCP work remain outside this checkpoint.
