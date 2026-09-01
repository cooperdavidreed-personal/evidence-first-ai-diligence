# Underwriting Desk

**A calm, evidence-linked private-markets application with deterministic finance, a supported browser-local deal intake, and human-owned decisions.**

The product combines a governed Python analytical kernel with a static React application. Two retained synthetic cases demonstrate full buyout and growth underwriting; a third deal can be created through ordinary file controls using the supported **Growth SaaS Quick Package v1**.

> **Status: LOCAL PRODUCT CANDIDATE — FOUNDER REVIEW PENDING**
>
> All retained companies and records are fictional. Outputs are illustrative and are not investment advice, approval, real-company diligence, investment-performance evidence, or an arbitrary-data-room claim. Uploaded package bytes remain in memory in the browser tab and refresh clears the deal.

## Product workflow

The root is **Deals**. Each deal has exactly five primary destinations:

1. **Overview** — analytical posture, rationale, decisive driver, downside, blocker, terms, and next action.
2. **Financials** — scenarios, transaction mechanics, sensitivities, and returns.
3. **Diligence** — blocking issues, evidence tests, human review, and the controlled model proposal tray.
4. **Documents** — package state, search, lineage, and reproduction detail behind progressive disclosure.
5. **IC Memo** — committee-ready summary and governed export artifacts.

Default decision surfaces lead with business meaning and keep hashes, schema identifiers, raw paths, internal analysis codes, and statistical notation inside technical disclosure.

## Supported deal intake

Choose the four files in [`workbench/public/sample-package`](workbench/public/sample-package) through **New deal → Choose package files → Validate and analyze**:

- `manifest.json` declares the package version, roles, byte counts, and SHA-256 digests.
- `deal.json` declares cash, financing, scenario assumptions, thresholds, cutoff, and analyst owner.
- `monthly_financials.csv` supplies revenue, cost of revenue, and operating expense in integer cents.
- `customer_arr.csv` supplies fixed-cohort ARR in integer cents.

The browser hashes and validates the selected bytes locally. Missing, invalid, unsupported, excluded, and recognized inputs are explicit. A complete supported package produces only the declared v1 metrics and either `READY FOR IC REVIEW` or `HOLD`; an incomplete package produces `NO CALL — PACKAGE INCOMPLETE` and no return conclusion. The retained Python engine remains the full-fidelity route for debt, preferences, dilution, econometrics, simulation, and complete lineage.

## Controlled model and MCP boundaries

The only model job is **Challenge selected evidence**. A user selects and confirms the exact evidence subset; admitted outputs are evidence-linked thesis challenges, diligence gaps, and draft memo text. Every item starts as `PROPOSED`. Model output cannot change finance, assumptions, thresholds, package state, issues, analytical posture, recommendation, or approval.

The public build intentionally has no model endpoint or credential. It displays an honest unavailable state while all deterministic workflows remain functional. A separately governed runtime may provide `VITE_MODEL_REVIEW_URL`; credentials belong in that server runtime, never in this repository or browser bundle.

The local stdio MCP server is documented at [`workbench/mcp-server/README.md`](workbench/mcp-server/README.md). It exposes seven read tools and three in-memory proposal tools. It has no approval, decision, assumption, metric, threshold, persistence, private-file, or network mutation tool.

## Run and verify locally

Python 3.11+ and Node 22+ are required. The lockfile-resolved environment is authoritative.

```bash
uv sync --locked --extra dev --extra quality
bash scripts/verify-underwriting.sh
```

For frontend-only development:

```bash
cd workbench
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

For the local MCP surface:

```bash
cd workbench
node mcp-server/server.mjs
```

The full verifier runs the Python/kernel suite, mutation gates, deterministic case regeneration, source-room binding, estimator coverage, memo and recovery builds, frontend/data/intake/model tests, MCP tests, TypeScript/Vite build, lazy-chunk budgets, desktop/mobile Playwright flows, pixel regression, accessibility evidence, PDF contracts, and visual-manifest identity.

See the frozen [vertical-slice contract](docs/PRODUCT-VERTICAL-SLICE-CONTRACT.md), [underwriting architecture](docs/UNDERWRITING-ARCHITECTURE.md), [v2 benchmark contract](docs/V2-BENCHMARK-CONTRACT.md), [v2 model-integrity contract](docs/V2-MODEL-INTEGRITY-CONTRACT.md), [v2 econometrics contract](docs/ECONOMETRICS-CONTRACT-V2.md), and [observed usability protocol](docs/OBSERVED-USABILITY-PROTOCOL.md).

## Evidence and limits

- Accounting uses integer cents or declared decimal arithmetic; return and waterfall paths retain their exact governed checks.
- The same seed reproduces canonical source-room bytes and digests.
- The retained browser proof covers Deals, five destinations for two retained cases and one local package case, complete and incomplete intake, desktop/mobile overflow, and automated accessibility scans.
- Automated route evidence is not comprehensive WCAG certification or observed practitioner usability.
- Synthetic econometric recovery is not a real-company causal claim, investment forecast, or backtest.
- Browser-local operation is not encrypted persistence, multi-user access, confidential-data readiness, or enterprise security.
- Runtime inference, observed practitioner testing, and real-data-room support remain `NOT RUN`.

## Authorship and license

Cooper David Reed is the project lead and product/analytical owner. Claude Code and Grok Build supplied bounded read-only advisory review; Codex remained the sole filesystem writer. No Tailwind Plus or Catalyst bytes were copied into this slice. The repository is licensed under [Apache-2.0](LICENSE).
