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
| CSS | 47.34 KB | 8.92 KB | 12 KB gzip | `PASS` |
| Application shell | 298.86 KB | 86.01 KB | 100 KB gzip | `PASS` |
| Generated analytical case payload | 4,490.37 KB | 748.76 KB | 800 KB gzip | `PASS` |
| Total initial static transfer, gzip-equivalent | 4,837.14 KB | 844.03 KB | 900 KB gzip | `PASS` |
| Third-party runtime origins | 0 | 0 | 0 | `PASS` |

At the start of this productization lane the application and case payload were
emitted as one 830.82 KB gzip JavaScript entry. Separating the application shell
from generated case data reduced the shell entry to 86.01 KB gzip, an 89.6%
reduction. This improves cache behavior and makes the code/data boundary visible;
the current route still loads the combined case payload immediately.

## What is and is not established

- TypeScript compilation, production minification, gzip sizes, and absence of
  runtime third-party dependencies are verified locally.
- Desktop and mobile browser flows test root overflow, keyboard interaction,
  route restoration, and automated Axe rules for the covered states.
- LCP, INP, CLS, FCP, TBT, Speed Index, cold-cache network timing, and hosted
  cache headers are `NOT RUN`. The required Chrome DevTools performance-trace
  interface was not configured in this environment.
- The 748.76 KB gzip data chunk is an intentional trade: it contains both
  complete synthetic analytical cases and deep receipt/lineage records. It is
  not evidence that the hosted experience will meet a particular Core Web
  Vitals threshold.

## Next performance move

Split generated case data into one immutable chunk per case and load the second
case only on switch or idle prefetch. Acceptance should preserve stable deep
links, full offline behavior after load, and exact metric-to-source lineage. A
Chrome performance trace on the actual hosted candidate remains required before
making a public speed claim.
