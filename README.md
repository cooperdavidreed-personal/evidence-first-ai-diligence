# Underwriting Intelligence Lab

**An evidence-bound PE and VC underwriting workbench that shows where the numbers came from—and where judgment begins.**

This portfolio candidate combines a deterministic Python analytics layer with a static React investment-committee workbench. Two fully synthetic cases demonstrate the same governed workflow across control buyout and venture/growth underwriting:

- **AtlasGrid Systems:** a 60-month vertical-SaaS buyout that exposes retention survivorship, parent-level concentration, underburdened gross margin, challenged EBITDA add-backs, and leverage fragility. Illustrative IC decision: `REPRICE`.
- **Helios Compute Control:** an AI-infrastructure growth investment that separates design-partner performance from ordinary cohorts, recomputes pipeline, models tiered market adoption, reconciles dilution, and stress-tests venture outcomes. Illustrative IC decision: `INVEST`, subject to milestones.

> **Status: LOCAL PORTFOLIO CANDIDATE — FOUNDER REVIEW PENDING**
>
> Both companies and all underlying records are fictional. Every screen states `SYNTHETIC — NOT INVESTMENT ADVICE`. The workbench does not fetch private data, make autonomous investment decisions, or establish real-world investment accuracy. Hosted CI and public release are `NOT RUN`.

## What makes it substantive

The application does not begin with a chat box or a generated memo. It begins with versioned data-room manifests, precommitted analysis specifications, exact accounting bridges, and explicit causal classifications. Each displayed headline number opens a lineage record binding the metric to an artifact, field, and analysis receipt.

The workbench presents five shared views for both cases:

1. **IC Snapshot** — decision, terms, returns, decisive drivers, and falsifiers.
2. **Thesis & Evidence** — thesis, counterthesis, contradictions, diligence requests, and lineage.
3. **Econometric Lab** — estimand, population, method, uncertainty, diagnostics, and naive-versus-identified comparisons.
4. **Underwriting Room** — scenario selection, sensitivities, capital mechanics, and seeded return distributions.
5. **Value Creation** — evidence-linked initiatives, KPI baselines, owners, milestones, risks, and value bridges.

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
- Scenario books, thesis graphs, decisions, and receipts are independently hash-bound.
- Six seeded recovery runs test 15 precommitted synthetic recovery checks. This is estimator recovery against planted synthetic truth—not backtested investment performance.
- `NOT_IDENTIFIED` analyses abstain rather than convert correlation into causal claims.

See [Underwriting Architecture](docs/UNDERWRITING-ARCHITECTURE.md), [Product Contract](docs/UNDERWRITING-PRODUCT-CONTRACT.md), [Econometrics Contract](docs/ECONOMETRICS-CONTRACT.md), and [Build Provenance](docs/BUILD-PROVENANCE.md).

## Evidence kernel

The accepted foundation still supports content-addressed evidence packets, exact-quote checks, counterevidence, temporal leakage controls, prompt-injection handling, and human-owned judgment. Its prior silent slide demo remains explicitly `QUALITY SHORT` and is not the portfolio demo. See [Architecture](docs/ARCHITECTURE.md), [Threat Model](docs/THREAT-MODEL.md), and [Career Claims](docs/CAREER-CLAIMS.md).

## Authorship and license

Cooper David Reed is the founder and lead implementer. Multi-model advisory work is disclosed in the technical provenance record, while Codex remained the sole filesystem writer. The project is licensed under [Apache-2.0](LICENSE).
