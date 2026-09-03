# Final convergence gap map

Observed base: `f248ce27283318b3f3b3605781d8e17bd844dd63`  
Observed branch: `codex/underwriting-final-convergence`  
Directive: [`FINAL-CONVERGENCE-DIRECTIVE.md`](FINAL-CONVERGENCE-DIRECTIVE.md)

This is an implementation map, not an acceptance verdict. Existing behavior is preserved where it already meets the directive. Partial synthetic-fixture behavior is not promoted to general deal-ingestion capability.

| # | Required clean-browser proof | Current state | Disposition | Primary implementation / test owner |
| --- | --- | --- | --- | --- |
| 1 | Import XLSX, CSV and PDF | `NOT_IMPLEMENTED`: the picker accepts all three, but only the declared JSON/CSV Quick Package is parsed; XLSX and PDF are explicitly unsupported | `BUILD` | `workbench/src/intake.ts`, admission fixtures, intake tests |
| 2 | Explain mappings, exclusions and missing information | `PARTIAL`: strong JSON/CSV manifest validation and file statuses; no sheet/range/page mapping or ambiguity workflow | `IMPROVE` | admission contract and Evidence Review |
| 3 | Establish human-approved Version 1 | `NOT_IMPLEMENTED`: a valid package becomes a local analytical result without a separate named baseline-approval event | `BUILD` | workspace state and intake confirmation |
| 4 | Record qualitative notes linked to diligence or thesis | `PARTIAL`: private note and two observation kinds exist; visibility, review state, related question and broader note types do not | `IMPROVE` | workspace schema, observation composer, tests |
| 5 | Admit revised evidence as Version 2 | `PARTIAL`: AtlasGrid has a deterministic retained revision fixture; the local admitted-deal path has no general V2 admission | `BUILD` | versioned local deal bundle and revision intake |
| 6 | Display material changes and financial consequences | `PARTIAL`: retained AtlasGrid change control does; local imported deals do not | `IMPROVE` | unified Change Cockpit |
| 7 | Mark affected assumptions, issues, approvals and memo sections stale | `PARTIAL`: supported by the retained AtlasGrid change-control state; not bound to admitted local revisions | `IMPROVE` | propagation contract and stale-state selectors |
| 8 | Named accept, reject or defer | `VERIFIED_LOCAL` for retained change fixture | `PRESERVE` | `change-control-workspace.tsx`, tests |
| 9 | Rejection preserves Version 1 | `VERIFIED_LOCAL` for retained change fixture | `PRESERVE` | change-control tests and export assertions |
| 10 | Acceptance alone updates canonical state | `PARTIAL`: retained revision changes decision/memo context after acceptance, but the admitted source bundle does not become a generally versioned canonical package | `IMPROVE` | canonical version pointer and replay |
| 11 | Excel output contains accepted values and version references | `NOT_IMPLEMENTED`: portable JSON and memo text/PDF paths exist; no workbook round trip | `BUILD` | XLSX export/import adapter and workbook-diff tests |
| 12 | IC memo contains only accepted scenario and evidence | `PARTIAL`: retained memo reconciliation blocks pending/deferred changes and has accepted-state regression coverage; local V1/V2 binding is absent | `IMPROVE` | memo export gate and end-to-end test |
| 13 | Finance-native source trace within three interactions | `PARTIAL`: retained cases have granular locators and lineage drawer; local intake primarily lists source filenames | `IMPROVE` | split evidence preview and admitted locators |
| 14 | Connected model reads/proposes without mutation | `VERIFIED_LOCAL` for retained synthetic cases and the exact Northstar sample; not a general uploaded-data claim | `PRESERVE` | bounded hosted route and MCP server tests |
| 15 | Reload and state restoration succeed | `PARTIAL`: valid v2 state reloads and invalid state fails closed; supported version migration and recovery preview are absent | `BUILD` | workspace v3 migration/recovery contract |
| 16 | Public-record case enforces a historical cutoff | `NOT_IMPLEMENTED`: CoreWeave remains a plan and LangChain is URL-only/unverified; neither is a surfaced retrospective underwriting case | `BUILD` | public source pack, temporal tests, runtime case |
| 17 | No broken controls, clipping, migration warning, grammar error or machine debris | `PARTIAL`: prior desktop checks passed selected routes; final workflow and new state paths remain untested | `VERIFY/REPAIR` | Playwright desktop suite and visual evidence |
| 18 | Repository, release, deployment and exact commit agree | `PARTIAL`: public main and live URL exist; final-convergence bytes, release metadata and exact deployment binding do not yet exist | `VERIFY/RELEASE` | release receipt, GitHub and Vercel checks |

## Module disposition

| Module | Ruling | Reason |
| --- | --- | --- |
| Deterministic PE/VC engines | `PRIMARY` | Required authority for financial consequences |
| Change-control contract | `PRIMARY / IMPROVE` | Strongest substrate; must become the main admitted-deal workflow |
| Evidence lineage and source previews | `PRIMARY / IMPROVE` | Required for trust; local intake needs cell/row/page depth |
| Notes, issues, assumptions, memo | `IMPROVE` | Useful substrate that needs version and relationship fields |
| Hosted evidence challenge and MCP | `INFRASTRUCTURE / PRESERVE` | Proves replaceable advisory models; should not dominate navigation |
| Technical receipts and hashes | `HIDE` | Preserve for verification; remove from the ordinary investor path |
| Current five-view navigation | `IMPROVE` | Consolidate into the three directive surfaces without deleting useful components |
| CRM, relationships, generic chat, enterprise admin, mobile | `FREEZE` | Outside the purchase-defining workflow and explicit directive |

## Baseline verification

- Workbench unit/contracts: `119/119 PASS` with `pnpm test`.
- Python: direct global `pytest` and bare `uv run pytest` were invalid invocations because they did not run the project dev environment. Canonical `uv run --extra dev python -m pytest` passed with exit `0`.
- Provider probe: Codex executable present; Claude and Grok remain `HELD_PROVIDER` under the current mission policy and canonical control-plane observation.

