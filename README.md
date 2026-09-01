# Underwriting Intelligence Lab

**A synthetic investment workbench that keeps evidence, assumptions, empirical tests, transaction mechanics, and human judgment connected to the decision they change.**

This portfolio candidate combines a deterministic Python analytics layer with a static React investment-committee workbench. Two fully synthetic cases demonstrate the same governed workflow across control buyout and venture/growth underwriting:

**[Open the live workbench](https://cooperdavidreed-personal.github.io/evidence-first-ai-diligence/)** · **[Watch the 75–90 second product demonstration](https://cooperdavidreed-personal.github.io/evidence-first-ai-diligence/demo/release-fix/underwriting-lab-demo-1080p.mp4)** · **[Read the release verification report](docs/RELEASE-FIXES-REPORT.md)**

- **AtlasGrid Systems:** a 60-month vertical-SaaS buyout that exposes retention survivorship, parent-level concentration, underburdened gross margin, challenged EBITDA add-backs, and leverage fragility. Illustrative IC decision: `REPRICE`.
- **Helios Compute Control:** an AI-infrastructure growth investment that separates design-partner performance from ordinary cohorts, recomputes pipeline, models tiered market adoption, and runs exact event-by-event dilution, milestone, runway, preference-waterfall, and dated-return mechanics. Illustrative IC decision: `HOLD` under the selected synthetic prior and analyst-set loss policy, with both exposed for bounded what-if review.

> **Status: PUBLIC-DEMO CANDIDATE — OBSERVED PRACTITIONER TESTING NOT RUN**
>
> Both companies and all underlying records are fictional. Every screen states `SYNTHETIC — NOT INVESTMENT ADVICE`. The workbench does not fetch private data, make autonomous investment decisions, or establish real-world investment accuracy. It is not an enterprise-security, confidential-data-readiness, firm-adoption, or proprietary-integration claim.

## Evidence-to-decision workflow

The application does not begin with a chat box or an AI-generated answer. It begins with an investment question and a declared recommendation. The flagship AtlasGrid path lets a reviewer:

1. Understand the company, proposed terms, current call, downside, and unresolved gates.
2. Change a precomputed entry-price assumption and rerun deterministic sponsor returns.
3. Record a private browser-local note or human investment observation.
4. Review and explicitly approve or reject material assumptions without silently rewriting the model.
5. Inspect a randomized renewal-pricing test, its interval, plain-language interpretation, and limitations.
6. Search the synthetic deal package and distinguish management representations, retained synthetic records, analyst assumptions, human observations, and model hypotheses.
7. Trace a decisive number through its calculation and retained source excerpt.
8. Open a one-page IC snapshot, detailed underwriting packet, or separate technical appendix.

The Lab remains the canonical deal state. The current public slice has no runtime model: model hypotheses are absent from the case record, and no model can approve assumptions or an investment. A small controlled MCP surface is a later priority after the investor workflow and deployment are stable.

The investor workspace presents four primary decision views for both cases:

1. **Overview** — IC question, analytical recommendation, company context, material assumption, terms, returns, and advancement gate.
2. **Financials** — scenarios, sensitivities, capital mechanics, and seeded return distributions.
3. **Risks** — canonical blockers, owners, stages, consequences, and management questions.
4. **Memo** — a literal one-page committee snapshot plus links to the detailed packet and technical appendix.

The supporting Evidence layer retains thesis, value-creation, source, econometric, and audit records without making technical receipts the default journey. See the authoritative [revised evidence-to-decision direction](docs/REVISED-EVIDENCE-TO-DECISION-DIRECTION.md) and the [observed usability protocol](docs/OBSERVED-USABILITY-PROTOCOL.md).

## Run locally

Python 3.11+ and Node 22+ are required. The application has no runtime backend or network dependency.

```bash
uv sync --locked --extra dev --extra quality
bash scripts/verify-underwriting.sh

cd workbench
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

Or exercise the analytics interface directly:

```bash
underwriting-lab generate --case atlasgrid --seed 20260828 --out dist/atlasgrid
underwriting-lab analyze \
  --manifest dist/atlasgrid/case/manifest.json \
  --out dist/atlasgrid/analysis.json
underwriting-lab generate --case helios --seed 20260829 --out dist/helios
underwriting-lab analyze \
  --manifest dist/helios/case/manifest.json \
  --out dist/helios/analysis.json
underwriting-lab build-workbench \
  --cases dist/atlasgrid/analysis.json dist/helios/analysis.json \
  --out workbench/src/data/cases.json
```

The existing `ic-evidence-lab` CLI and evidence-kernel behavior remain intact.

## Verification model

- Money is generated and reconciled in integer cents; presentation uses declared rounding.
- The same seed produces byte-identical canonical data-room files and manifest digests.
- Verification truth lives outside the runtime case directory and is not serialized into the React payload.
- Analysis receipts declare question, population, cutoff, method, outputs, uncertainty or diagnostics, assumptions, classification, and input digests.
- The repository retains the reviewable synthetic source rooms used by the two golden cases. Generation and public staging fail closed on undeclared files, truth artifacts, unsafe paths, or digest drift.
- Scenario books, thesis graphs, decisions, and receipts are independently hash-bound.
- Helios uses four distinct financing regimes—milestone-funded, tranche-withheld plus Series D, down round, and financing shortfall. Each named exit value is derived from retained LTM revenue, a declared five-year growth path, and a revenue multiple before flowing through dilution, preferences, and dated investor returns. Its 1,000-path stress distribution also varies operating cash, exit value, and two-sided exit timing and reports Monte Carlo standard error for binary path probabilities.
- Six seeded smoke-recovery runs test 45 planted-truth conditions. Separate frozen 500-seed interval ledgers recover AtlasGrid endpoints at 477/500, 472/500, and 471/500 and the Helios optimizer endpoint at 476/500. These are synthetic estimator checks—not backtested investment performance.
- Venture proceeds are checked against an independent exact waterfall implementation over 500 random exits and each discovered conversion breakpoint at one cent below, at, and above the boundary.
- Every Helios headline ownership, MOIC, XIRR, cash, and waterfall value is bound to explicit operands, dated cash flows, formulas, source locators, and governing receipts.
- AtlasGrid's maximum-bid solver enforces the base IRR/MOIC hurdle and the named downside IRR/MOIC, liquidity, default, and covenant floors; one additional cent must fail at least one frozen constraint. Seller rollover is explicitly dilutive pro-rata contributed equity and conserves exit proceeds to the cent.
- The retained browser evidence covers the four primary views and supporting Evidence layer for both cases at 1440x900 and 390x844, plus landing, case switching, guarded assumption review, canonical assumption changes, contextual source inspection, and four exact-match Axe evidence records. This is bounded automated route evidence, not observed practitioner usability or comprehensive WCAG certification.
- `NOT_IDENTIFIED` analyses abstain rather than convert correlation into causal claims.

See [Underwriting Architecture](docs/UNDERWRITING-ARCHITECTURE.md), the controlling [v2 Benchmark Contract](docs/V2-BENCHMARK-CONTRACT.md), [v2 Model-Integrity Contract](docs/V2-MODEL-INTEGRITY-CONTRACT.md), [v2 Econometrics Contract](docs/ECONOMETRICS-CONTRACT-V2.md), [Performance Budget](docs/PERFORMANCE-BUDGET.md), [Founder Interview Guide](docs/COOPER-INTERVIEW-GUIDE.md), and [Build Provenance](docs/BUILD-PROVENANCE.md). The original [product](docs/UNDERWRITING-PRODUCT-CONTRACT.md) and [econometrics](docs/ECONOMETRICS-CONTRACT.md) contracts are retained only as historical v1 context.

## Evidence kernel

The accepted foundation still supports content-addressed evidence packets, exact-quote checks, counterevidence, temporal leakage controls, prompt-injection handling, and human-owned judgment. See [Architecture](docs/ARCHITECTURE.md), [Threat Model](docs/THREAT-MODEL.md), and [Career Claims](docs/CAREER-CLAIMS.md).

## Known limits

- Notes and observations use browser-local storage. They are not shared, encrypted, permissioned, or suitable for confidential information.
- The public source rooms are fictional. The system has not been tested against a live data room or real investment process.
- The econometric exercises recover planted synthetic effects. They do not validate a real-company causal claim or investment strategy.
- Automated accessibility checks cover the tested routes only; they are not comprehensive WCAG certification.
- There is no live model/API integration in the deployed slice. This avoids a shallow integration and keeps consequential writes out of scope until an approval protocol is implemented.
- Helios's loss-frequency result is a synthetic stress output, not an empirical forecast. The workbench exposes the governing prior, scenario mix, loss definition, policy maximum, owner, rationale, and review status; local what-if edits never change the released decision or constitute approval.
- Observed PE/VC practitioner usability and public deployment availability must be reported from current evidence, not inferred from local tests.

## Authorship and license

Cooper David Reed is the project lead and product/analytical owner. Multi-model advisory work is disclosed in the technical provenance record, while Codex remained the sole filesystem writer. The project is licensed under [Apache-2.0](LICENSE).
