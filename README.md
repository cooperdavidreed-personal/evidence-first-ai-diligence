# Underwriting Intelligence Lab

**An evidence-bound PE and VC underwriting workbench that shows where the numbers came from—and where judgment begins.**

This portfolio candidate combines a deterministic Python analytics layer with a static React investment-committee workbench. Two fully synthetic cases demonstrate the same governed workflow across control buyout and venture/growth underwriting:

- **AtlasGrid Systems:** a 60-month vertical-SaaS buyout that exposes retention survivorship, parent-level concentration, underburdened gross margin, challenged EBITDA add-backs, and leverage fragility. Illustrative IC decision: `REPRICE`.
- **Helios Compute Control:** an AI-infrastructure growth investment that separates design-partner performance from ordinary cohorts, recomputes pipeline, models tiered market adoption, and runs exact event-by-event dilution, milestone, runway, preference-waterfall, and dated-return mechanics. Illustrative IC disposition: `CONDITIONAL INVEST`, pending human approval and executable milestones.

> **Status: LOCAL CANDIDATE IN VERIFICATION — NOT YET ACCEPTED FOR FOUNDER REVIEW**
>
> Both companies and all underlying records are fictional. Every screen states `SYNTHETIC — NOT INVESTMENT ADVICE`. The workbench does not fetch private data, make autonomous investment decisions, or establish real-world investment accuracy. Hosted CI and public release are `NOT RUN`.

## What makes it substantive

The application does not begin with a chat box or a generated memo. It begins with versioned data-room manifests, precommitted analysis specifications, exact accounting bridges, and explicit causal classifications. Each displayed headline number opens a lineage record binding the metric to its governing receipt and every declared analysis input. Locator-v3 records retain a structured source excerpt, exact selection digest, committed repository path, and public-candidate path; the staged source pack is rebuilt only from manifest-declared synthetic files.

The workbench presents five shared views for both cases:

1. **IC Snapshot** — decision, terms, returns, decisive drivers, and falsifiers.
2. **Thesis & Evidence** — thesis, counterthesis, contradictions, diligence requests, and lineage.
3. **Econometric Lab** — estimand, population, method, uncertainty, diagnostics, and naive-versus-identified comparisons.
4. **Underwriting Room** — scenario selection, sensitivities, capital mechanics, and seeded return distributions.
5. **Value Creation** — evidence-linked initiatives, KPI baselines, owners, milestones, risks, and value bridges.

The productized reader adds a 60-second IC brief, an explicit authority bar, a
predeclared hurdle ledger, a searchable deal-room index, progressive
business-to-audit lineage, and stable URLs for case, room, scenario, driver,
sensitivity cell, and metric focus. See the controlling [Investor Experience
Contract](docs/INVESTOR-EXPERIENCE-CONTRACT.md).

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

## Render the product walkthrough

The former static-card reel was retired as `QUALITY SHORT`. Its replacement is
a 150-second silent, captioned recording of the real local workbench through
ordinary controls. The retained manifest binds the media to clean source commit
`f4a957cf8c7eea32029a97cb6b2d35f0b0f9f95b`, the exact source closure, captions,
toolchain, and video digest. Founder viewing and public release remain pending:

```bash
uv sync --frozen --extra demo
uv run python scripts/render_demo.py --out demo/release
uv run python scripts/verify_demo.py --root demo/release
```

The film covers decision posture versus authority, hurdle tests, number-to-source
inspection, deal-room search, econometric model credit, PE scenario changes,
VC milestone failure, and the value-creation bridge. It remains a local founder-
review candidate until the release packet and rendered film are approved.

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
- The retained browser evidence covers all five views for both cases at 1440x900 and 390x844, including first-viewport terms, keyboard DAG traversal, metric-to-source inspection, and four exact-match Axe evidence records. This is bounded route evidence, not comprehensive WCAG certification.
- `NOT_IDENTIFIED` analyses abstain rather than convert correlation into causal claims.

See [Underwriting Architecture](docs/UNDERWRITING-ARCHITECTURE.md), the controlling [v2 Benchmark Contract](docs/V2-BENCHMARK-CONTRACT.md), [v2 Model-Integrity Contract](docs/V2-MODEL-INTEGRITY-CONTRACT.md), [v2 Econometrics Contract](docs/ECONOMETRICS-CONTRACT-V2.md), [Performance Budget](docs/PERFORMANCE-BUDGET.md), [Founder Interview Guide](docs/COOPER-INTERVIEW-GUIDE.md), and [Build Provenance](docs/BUILD-PROVENANCE.md). The original [product](docs/UNDERWRITING-PRODUCT-CONTRACT.md) and [econometrics](docs/ECONOMETRICS-CONTRACT.md) contracts are retained only as historical v1 context.

## Evidence kernel

The accepted foundation still supports content-addressed evidence packets, exact-quote checks, counterevidence, temporal leakage controls, prompt-injection handling, and human-owned judgment. See [Architecture](docs/ARCHITECTURE.md), [Threat Model](docs/THREAT-MODEL.md), and [Career Claims](docs/CAREER-CLAIMS.md).

## Authorship and license

Cooper David Reed is the project lead and product/analytical owner. Multi-model advisory work is disclosed in the technical provenance record, while Codex remained the sole filesystem writer. The project is licensed under [Apache-2.0](LICENSE).
