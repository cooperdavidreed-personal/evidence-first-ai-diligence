# Workbench performance budget

Status: `LOCAL BUILD MEASURED — HOSTED CORE WEB VITALS NOT RUN`

Measured from the current production build on 2026-09-01:

| Asset | Minified | Gzip | Budget | State |
|---|---:|---:|---:|---|
| HTML entry | 0.66 KB | 0.38 KB | 2 KB gzip | `PASS` |
| CSS | 50.84 KB | 9.66 KB | 12 KB gzip | `PASS` |
| Application shell | 389.88 KB | 113.39 KB | 125 KB gzip | `PASS` |
| AtlasGrid runtime case | 1,862.90 KB | 203.23 KB | 1,000 KB gzip | `PASS` |
| Helios runtime case | 1,665.14 KB | 162.49 KB | 1,000 KB gzip | `PASS` |

The alternative retained case is loaded only when selected. Runtime projection retains every operand needed by displayed formulas while excluding unused analytical bulk; the validator fails closed when a required operand is absent.

TypeScript compilation, production minification, gzip sizes, case separation, and the declared payload ceilings are locally verified. Desktop and mobile browser flows cover root overflow, route scroll restoration, keyboard operation, and automated Axe checks for the tested states.

LCP, INP, CLS, FCP, TBT, Speed Index, production cache behavior, cold-start latency for the bounded model endpoint, and hosted performance traces remain `NOT RUN` until measured against the exact deployed commit. No public speed or Core Web Vitals claim is authorized from this local build alone.
