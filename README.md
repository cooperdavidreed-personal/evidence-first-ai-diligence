# Underwriting Desk

Evidence-linked private-markets underwriting where deterministic finance, firm policy, analyst assumptions, model proposals, and human decisions remain separate.

> **Status: PUBLIC PRACTITIONER-TEST CANDIDATE — v0.2.1 RELEASE CANDIDATE**
>
> Every company, source record, policy, and output in the public demonstration is fictional and synthetic. This project is not investment advice, real-company diligence, investment-performance evidence, confidential-data-ready software, autonomous investment authority, or evidence of firm adoption.

Public application: [underwriting-desk-delta.vercel.app](https://underwriting-desk-delta.vercel.app/)

Prior release: [v0.2.0](https://github.com/cooperdavidreed-personal/evidence-first-ai-diligence/releases/tag/v0.2.0) · [88-second v0.2.0 demonstration](https://github.com/cooperdavidreed-personal/evidence-first-ai-diligence/releases/download/v0.2.0/underwriting-desk-demo-1080p.mp4) · [captions](https://github.com/cooperdavidreed-personal/evidence-first-ai-diligence/releases/download/v0.2.0/underwriting-desk-demo-captions.vtt)

## What it demonstrates

Underwriting Desk combines a governed Python analytical kernel with a React decision workspace:

- **AtlasGrid Systems** — a control-buyout case with accounting normalization, debt and covenant mechanics, scenario returns, sensitivities, synthetic causal tests, and a value-creation plan.
- **Helios Compute Control** — a growth-investment case with cohort economics, staged financing, ownership and dilution, preference waterfalls, runway, sensitivities, and milestone gates.
- **Northstar Metrics** — an ordinary browser-local intake using the supported Growth SaaS Quick Package v1.

Each deal has five destinations: **Overview**, **Financials**, **Diligence**, **Documents**, and **IC Memo**. The persistent decision rail keeps posture, blockers, policy state, and next action visible while the user works.

## Why it is different from underwriting in a general chatbot

The Desk owns canonical deal state. A frontier model is a replaceable advisory worker, not the calculation engine or decision-maker.

The system keeps seven states separate:

1. source facts and management representations;
2. deal terms;
3. analyst assumptions;
4. fund or IC policy;
5. deterministic calculations;
6. evidence-referenced model proposals; and
7. named human decisions.

Working scenarios do not overwrite the canonical case. Uploaded thresholds never become fund policy. Model output begins as `PROPOSED`; it cannot directly change finance, policy, assumptions, issues, recommendation, or approval. A named human must accept, reject, or edit it before accepted language can enter the memo.

## Supported public workflow

The application allows a user to:

- inspect recognized and missing source material;
- preview exact retained excerpts, rows, periods, fields, and calculation lineage;
- change bounded scenario inputs and see deterministic return consequences;
- compare canonical and unapproved what-if cases;
- add named observations and meeting notes;
- create, assign, update, resolve, and retain diligence issues;
- approve or reject material assumptions without rewriting source facts;
- select an exact evidence subset for a bounded model challenge;
- process the returned proposal through named human review;
- admit the included AtlasGrid Version 2 retention revision, rank its changes by decision impact, rerun retained deterministic economics, reopen diligence, mark affected assumptions and memo sections stale, and record a named accept/reject/defer disposition without overwriting Version 1;
- edit and export an IC memo; and
- export or restore portable browser-local deal state.

## Supported deal intake

Use **New deal** with the four files in [`workbench/public/sample-package`](workbench/public/sample-package):

- `manifest.json`
- `deal.json`
- `monthly_financials.csv`
- `customer_arr.csv`

The browser verifies declared roles, sizes, SHA-256 digests, cutoff behavior, and supported fields. A complete Northstar package reproduces $15.9M LTM revenue, 70.0% gross margin, an 83.6% opening-cohort retention proxy over an 11-month interval, 33.3% post-money ownership, 3.23x gross MOIC, and 26.5% annualized gross return. The proxy is not annual NRR; it is compared directionally with the separate 95% annual NRR screen while cohort completeness remains blocked. That concern and six other diligence or policy gates keep the posture at `SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED`; clearing an illustrative return screen does not make the deal IC-ready. Removing or modifying a required source produces `NO CALL — PACKAGE INCOMPLETE` and suppresses return conclusions.

Uploaded raw files are not retained as an unrestricted data room. The admitted parsed deal, its bounded replay sources, and the human workspace persist locally and can be exported and re-imported through a validated bundle. This is not encrypted, shared, authenticated, or appropriate for confidential information.

## Model and MCP boundaries

The release candidate's hosted model job is limited to **Challenge selected evidence** for AtlasGrid, Helios, and the included Northstar package. Arbitrary uploaded packages retain deterministic analysis and human workflow but do not display a model control as functional. The browser sends only the evidence subset the user confirms. The server verifies the request against a retained synthetic evidence registry, constrains output to cited challenges, diligence gaps, and one draft memo section, and returns no direct mutation. Browser-side provider keys are prohibited. The live public adapter currently uses `openai/gpt-5.4-mini` through Vercel AI Gateway; that provider is replaceable and does not become an authority surface. Exact hosted verification is recorded in [`LOCAL-VERIFICATION.md`](LOCAL-VERIFICATION.md).

The local stdio MCP surface is documented in [`workbench/mcp-server/README.md`](workbench/mcp-server/README.md). It exposes seven read tools and three proposal tools. It has no approval, policy, calculation, recommendation, private-file, trading, spending, or network-mutation tool.

## Decision materials

The release candidate includes three distinct artifacts for each retained case:

- one-page IC snapshot;
- partner-facing underwriting packet; and
- separate technical appendix.

They are available in [`output/pdf`](output/pdf). Technical identifiers, formulas, and receipts stay in the appendix rather than the partner-facing decision pages.

The preserved 88-second v0.2.0 film opens with AtlasGrid's selected structure versus seller ask, preserves the resulting `REPRICE` consequence, then demonstrates fail-closed Northstar intake, exact evidence inspection, named human judgment, a bounded model proposal, human disposition, and memo output. Its exact MP4 is bound to product-source commit `5faeb1432be54d0b9a9eb3eca9a70014414e359c` and SHA-256 `06d2805e73dc6cc75c433fd2a81eb6b75eff95740e9cc92baf54e815315bcbed`. It is historical release evidence, not a demonstration of the v0.2.1 change-control slice. No replacement media is part of this sprint.

## Run and verify locally

Python 3.11+ and Node 22+ are required.

```bash
uv sync --locked --extra dev --extra quality
bash scripts/verify-underwriting.sh
```

For frontend development:

```bash
cd workbench
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

For the local MCP server:

```bash
cd workbench
node mcp-server/server.mjs
```

The v0.2.1 workbench gate covers frontend and model contracts, MCP, TypeScript/Vite, payload budgets, deterministic scenario/memo consistency, public source availability, state export/import, AtlasGrid Version 1→Version 2 propagation, desktop Chrome/WebKit journeys, automated accessibility, and PDF rendering. Phone-specific rendering and QA are intentionally deferred from this sprint; no mobile-readiness claim is made.

## Evidence and limits

- Accounting uses integer cents or declared decimal arithmetic; return, debt, and waterfall mechanics remain deterministic.
- The same seed reproduces canonical synthetic source-room bytes and digests.
- Econometric receipts state the estimand, method, uncertainty, assumptions, diagnostics, and classification; the investor interface leads with underwriting meaning and an explicit limitation rather than statistical notation.
- Synthetic estimator recovery is not a real-company causal claim, investment forecast, or backtest.
- Automated accessibility checks are not comprehensive WCAG certification.
- Browser-local persistence is not enterprise security or confidential-data readiness.
- Observed practitioner testing remains `NOT RUN`; give participants the [20-minute test card](docs/PRACTITIONER-TEST-CARD.md), use the [moderator and scoring protocol](docs/PRACTITIONER-TESTING-PACKAGE.md), and retain results in the [feedback template](docs/practitioner-feedback-template.csv) without fabricating outcomes.
- Passing tests do not establish investment accuracy, performance improvement, production adoption, or model superiority.

The current release receipt identifies the exact public product commit, deployment, tests, independent reviews, and remaining limitations. Historical mission receipts remain preserved as prior-state evidence rather than current release claims.

## Authorship and license

Cooper David Reed is the project lead and product/analytical owner. Codex performed implementation and repository work; Claude, Grok, and ChatGPT were assigned bounded advisory and independent-review roles. A reviewer receives credit only for an exact completed review; provider availability is not treated as agreement. Deterministic tests and human review remain authoritative.

Licensed under [Apache-2.0](LICENSE).
