# Episode 04 — controlled model workflow and local MCP

State: `VERIFIED`

Runtime inference state: `HELD_PROVIDER` — no runtime credential or inference endpoint is configured in the public build.

## Controlled model workflow

- One job only: `Challenge selected evidence`.
- A user must select evidence and confirm the exact subset before any configured inference request is sent.
- The request contains only bounded evidence IDs, titles, display values, summaries, the job name, and the output contract. Uploaded file bytes are never included.
- Structured outputs are thesis challenges, diligence gaps, and memo drafts.
- Every admissible item must cite at least one selected evidence ID. Empty, unknown, invalid, or uncited items are dropped and counted.
- Every admitted item starts at `PROPOSED`. Human acceptance or rejection creates a reviewed proposal value; it does not mutate canonical case JSON, finance, assumptions, thresholds, package completeness, issues, or the analytical posture.
- With no configured endpoint, the product states that model review is unavailable and leaves every deterministic workflow functional. No canned model answer is displayed.

## MCP surface

Local stdio reads:

- `list_deals`
- `get_decision`
- `get_decision_tests`
- `list_issues`
- `get_metric_lineage`
- `search_package`
- `list_analyses`

Local in-memory proposals:

- `propose_observation`
- `propose_diligence_request`
- `propose_memo_section`

Every proposal returns `status: PROPOSED` and `approval_state: PROPOSED`. The server has no approval, decision, assumption, metric, threshold, package-state, persistence, private-file, or network tool.

## Deterministic evidence

- Frontend, data-contract, intake, model-schema, and model-UI tests: `33/33 PASS` across five files.
- MCP tool-surface, read, proposal, canonical-byte-invariance, unknown-evidence, and forbidden-tool tests: `4/4 PASS`.
- TypeScript compilation and Vite production build: `PASS`.
- Case-chunk verification: `PASS`; shell gzip 81,824 bytes, AtlasGrid payload gzip 718,257 bytes, Helios payload gzip 607,795 bytes.
- Focused credential-pattern scan of the new model/MCP sources found no embedded provider credential. The public build contains an optional endpoint address only when `VITE_MODEL_REVIEW_URL` is deliberately configured; credentials belong only in the external server runtime.

## Limits

- A real provider inference response is `NOT RUN`; mock transport proves schema, citation, proposal, and no-mutation behavior only.
- MCP interoperability is verified locally against the retained public cases. It is not deployed as a public underwriting endpoint.
- Human acceptance is browser-local proposal review, not a governed canonical write protocol.
