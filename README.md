# Underwriting Desk

Built by **Cooper Reed**, founder and sole operator of Daily AI Agents LLC.

A persistent investment workspace that turns company materials and AI-assisted analysis into a maintained investment case, actionable diligence and consistent committee materials. Claude handles reading and drafting through an evidence-scoped connection. Excel remains the financial model. The Desk retains sources, changes, analyst decisions and the work still outstanding.

## Start with one operating change

The local candidate includes a synthetic monthly review: July revenue and EBITDA are restated, cash falls below a named analyst minimum, and funded debt increases. Review the delivery, inspect the source cells, create a diligence question, mark the old liquidity conclusion contradicted, then reconcile the partner update. The same period, scenario, currency and evidence cutoff follow that workflow.

**New deal → Try monthly operating review.** [Sample inputs and expected interpretation](examples/operating-review/README.md).

## Which version does what?

| Mode | Purpose and state | Persistence / model access |
|---|---|---|
| This branch: `codex/desk-workflow-proof-20260908` | Local workflow and proof candidate; not published or deployed | SQLite company records; opt-in local measurements; released-evidence MCP |
| [Published desktop trial](https://github.com/cooperdavidreed-personal/evidence-first-ai-diligence/releases/tag/desktop-pilot-20260908) | Earlier `c1d24f2` build; does not include this branch's operating review | Bundled Node runtime; guided Claude extension connection |
| [Public application](https://underwriting-desk-delta.vercel.app/) | Separate public synthetic demonstration; this branch has not changed it | Browser demonstration state, not a private company backend |
| Retained PE / VC cases | AtlasGrid acquisition, Helios growth financing, Northstar package intake | Defined deterministic transaction mechanics; not automatically applied to arbitrary uploaded workbooks |
| Static MCP mode | Retained synthetic case tools | Separate tool surface; not the private-company review store |

The public main and hosted release were last reconciled to `e866ca1` in the preceding release audit. That observation is dated, not a new live deployment verification.

## Run the local candidate

For developers: Node 24+, pnpm as pinned in `workbench/package.json`.

```sh
cd workbench
pnpm install --frozen-lockfile
pnpm build
pnpm desk:start
```

For an analyst, the native desktop package includes the runtime; use the [desktop guide](trial/DESKTOP-START.md). Build a new native candidate on macOS with Go and Xcode command-line tools using `node scripts/package-desktop.mjs` after the application build. Do not describe a Windows cross-build as a Windows workstation test.

Uploaded-company navigation is **Brief, Review, Model, Evidence, Committee**. The retained synthetic cases have their own transaction workspaces. [Architecture and mode boundaries](docs/proof/ARCHITECTURE.md).

## Verify the work

```sh
cd workbench
node --test mcp-server/*.test.mjs
node node_modules/vitest/vitest.mjs run
node scripts/evaluate-operating.mjs
node scripts/verify-operating-workflow.mjs
cd ..
python3 scripts/verify_operating_finance.py
```

The browser command requires a completed build and Chrome. The Python command uses the standard library and an independent Decimal oracle. Desktop extraction and recovery checks are documented in the [runbook](docs/proof/RUNBOOK.md).

- [Evaluation scope and frozen fixtures](evaluation/operating-review/README.md)
- [Task timing and Excel + assistant baseline protocol](docs/proof/MEASUREMENT.md)
- [Engineering and investment case study](docs/proof/CASE-STUDY.md)
- [Current verification status](docs/proof/STATUS.md)

## Boundaries

Sample companies and operating numbers are synthetic. Numeric citation checks test defined mapped facts, not general semantic understanding. Named reviewers are local actor labels, not firm authentication. The working database relies on device permissions and disk security; encrypted backups do not make it application-encrypted at rest. Model proposals cannot approve sources or human investment decisions. Only explicitly released evidence is made available through the private-company MCP tools.

No firm adoption, labor savings, investment performance, sustained uptime or cloud deployment is claimed. No model API call is required for deterministic calculations; external subscriptions and local hardware still have costs. [Security and operational boundaries](docs/proof/ARCHITECTURE.md).
