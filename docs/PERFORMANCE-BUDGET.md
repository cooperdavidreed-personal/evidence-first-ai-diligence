# Workbench performance budget

Status: `LOCAL BUILD MEASURED — CORE WEB VITALS NOT RUN`

The workbench is a static Vite application with no runtime backend, authenticated
service, third-party font, analytics tag, or external API call. Its analytical
payload is deliberately retained in the build so every displayed result can be
reviewed offline.

## Current production build

Measured with `pnpm --dir workbench build` on 2026-08-30:

| Asset | Minified | Gzip | Budget | State |
|---|---:|---:|---:|---|
| HTML entry | 0.57 KB | 0.34 KB | 2 KB gzip | `PASS` |
| CSS | 49.69 KB | 9.32 KB | 12 KB gzip | `PASS` |
| Application shell | 313.21 KB | 90.35 KB | 100 KB gzip | `PASS` |
| AtlasGrid analytical payload | 5,719.55 KB | 708.72 KB | 1,000 KB gzip | `PASS` |
| Helios analytical payload | 4,612.62 KB | 579.14 KB | 1,000 KB gzip | `PASS` |
| AtlasGrid initial static transfer, gzip-equivalent | 6,083.02 KB | 808.73 KB | 1,100 KB gzip | `PASS` |
| Helios initial static transfer, gzip-equivalent | 4,976.09 KB | 679.15 KB | 1,100 KB gzip | `PASS` |
| Third-party runtime origins | 0 | 0 | 0 | `PASS` |

At the start of this productization lane the application and case payload were
emitted as one 830.82 KB gzip JavaScript entry. Separating the application shell
from generated case data keeps the executable shell at 90.35 KB gzip, an 89.1%
reduction. Each case is now emitted as a separate validated dynamic module from
the single canonical `cases.json` source. A direct AtlasGrid route transfers
708.72 KB of case data; a direct Helios route transfers 579.14 KB. The alternate
case is requested only when the reviewer switches cases, and the loader caches
that validated module. The retained payloads include complete dated cash-flow
operands, monthly liquidity and covenant operands, all 1,000 seeded distribution
paths per case, quantile-rank proofs, sensitivity reruns, and value-creation
bridge calculations for every displayed investment output.

## What is and is not established

- TypeScript compilation, production minification, gzip sizes, and absence of
  runtime third-party dependencies are verified locally.
- Desktop and mobile browser flows test root overflow, keyboard interaction,
  route restoration, and automated Axe rules for the covered states.
- LCP, INP, CLS, FCP, TBT, Speed Index, cold-cache network timing, and hosted
  cache headers are `NOT RUN`. The required Chrome DevTools performance-trace
  interface was not configured in this environment.
- The case chunks are an intentional auditability trade: each contains a
  complete synthetic analytical case and the operands required to recompute
  decision-facing returns, sensitivities, distributions, and value bridges. A
  deterministic build-manifest gate proves case separation and enforces the
  frozen 1,000 KB payload and 1,100 KB initial-transfer gzip budgets. This is not
  evidence that a hosted experience will meet a particular Core Web Vitals
  threshold.

## Next performance move

Run a Chrome performance trace on the actual hosted candidate and verify its
cache headers before making a public speed claim. If cold-load experience still
misses a declared target, split audit-only path operands behind the relevant
lineage interaction without weakening offline review or formula replay.
