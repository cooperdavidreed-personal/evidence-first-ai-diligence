# Underwriting Desk v0.2.2 desktop-readiness audit

## Scope

This sprint starts from public `main` at `c7f46b808ba894db4fcfe63c280f55eab97145b5`. The September 3 directive titled *Underwriting Desk v0.2.1 directive — product readiness before any new demos* is the controlling product input. Mobile and tablet refinement, new media, career copy, authentication, multitenancy, confidential-data ingestion, and broad model integrations are outside this sprint.

## Directive mapping

| Directive | Baseline | v0.2.2 action |
| --- | --- | --- |
| Scenario-to-memo consistency | Partial | Bind an accepted AtlasGrid revision to its retained deterministic rerun; block reconciliation before human disposition; preserve Version 1 after rejection. |
| Public source links | Verified | Preserve the existing source-link coverage and public source pack. |
| Export reliability | Partial | Add an end-to-end accepted-revision export regression proving revised returns appear and superseded returns do not. |
| Evidence change to decision | Partial | Preserve digest-bound V1 to V2 intake, deterministic propagation, stale state, diligence reopening, and named disposition; align Overview and rail posture. |
| Investor-language clarity | Partial | Replace default Helios catastrophe/replay jargon with plain loss-risk language; move mechanics behind disclosure; remove machine identifiers from cap-table presentation. |
| Decision hierarchy | Partial | Put the investment posture before the change-control module; show observed, required, and status for every retained decision screen. |
| Desktop information density | Partial | Remove the permanent decision rail from Financials, Documents, and Memo while retaining it where it guides Overview and Diligence work. |
| Diligence usability | Partial | Add an explicit row-level action column while preserving issue ownership, status, due date, resolution, and quantitative locks. |

## Independent review

Claude Fable 5.1 completed a read-only desktop, finance, and workflow audit and returned `DESKTOP_REPAIR_READY`. Its highest-severity finding was that accepted Version 2 evidence could previously be reconciled into a Version 1 memo. Grok was invoked for an adversarial investor-abandonment audit but returned `HELD_PROVIDER`; no paid or API-key fallback was used.

## Verification

- Python analytical, financial, contract, and recovery tests: 189 passed.
- Workbench unit and integration tests: 119 passed.
- MCP boundary tests: 9 passed.
- Chrome desktop Playwright flows at 1440 by 900: 26 passed, 2 intentionally skipped provider-dependent paths.
- Mutation gates: 16 declared; 13 dynamic and 1 static gate passed; no whole-program mutation score is claimed.
- PDF contract: six files passed across 36 rendered pages.
- Public-file scan: 418 candidate files passed.
- Python and production JavaScript dependency audits: no known vulnerabilities reported at verification time.

The existing case chunks remain intentionally large and load on demand. This sprint does not claim comprehensive accessibility compliance, practitioner validation, confidential-data readiness, or production adoption.

## Honest boundary

The cases remain fictional and synthetic. The application is a public browser-local demonstration, not a confidential-data environment or proof of firm adoption. Deterministic calculations and retained synthetic analyses do not establish real-company investment outcomes.
