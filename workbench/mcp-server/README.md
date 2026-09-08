# Underwriting Desk local MCP surface

This local stdio server reads the retained public case JSON and creates proposals. It does not call a model, access private files, use network transport, approve proposals, or mutate the canonical case. Proposal persistence is off by default; an operator may explicitly enable an append-only local handoff ledger.

Run locally:

```bash
node mcp-server/server.mjs
```

To let the browser import model proposals for named human review, start the server with an explicit local ledger:

```bash
node mcp-server/server.mjs --proposal-ledger /tmp/underwriting-desk-proposals.jsonl
```

Claude Code:

```bash
claude mcp add --scope user underwriting-desk -- node "/absolute/path/to/workbench/mcp-server/server.mjs" --proposal-ledger "/tmp/underwriting-desk-proposals.jsonl"
```

Codex:

```bash
codex mcp add underwriting-desk -- node "/absolute/path/to/workbench/mcp-server/server.mjs" --proposal-ledger "/tmp/underwriting-desk-proposals.jsonl"
```

Read tools: `list_deals`, `get_decision`, `get_decision_tests`, `list_issues`, `get_metric_lineage`, `search_package`, and `list_analyses`.

Proposal tools: `propose_observation`, `propose_diligence_request`, and `propose_memo_section`. Every successful proposal returns `status: PROPOSED` and `approval_state: PROPOSED`. Human acceptance or rejection occurs outside MCP; there is intentionally no approval, decision, assumption, metric, threshold, or package-state mutation tool.

When enabled, the local JSONL ledger records the proposal plus the retained deal, manifest digest, analysis digest, and canonical evidence references. Importing it through **Diligence → Import proposal ledger** revalidates those bindings and forces every item back to `PROPOSED`, even if the file claims otherwise. Accepted memo language can then appear in the IC memo with the named human reviewer; accepted state follows the browser workspace persistence and validation rules.

This default static mode accesses only the two retained illustrative cases. It does not read browser-local deal state. Review-store mode below shares explicitly selected evidence instead. Client support for local stdio MCP varies; this implementation does not provide a remote authenticated HTTPS MCP service.

`tools/call` must include a JSON-RPC request id. Id-less tool-call notifications are dropped without execution so a client cannot create an invisible, unacknowledged proposal. Other unknown notifications are silent as required by JSON-RPC.

## Local workstation and selected-evidence review

Requires a Node runtime with `node:sqlite` (verified here on Node 26). From the workbench directory, run `pnpm build`, then `pnpm desk:start`. The standalone server binds only `127.0.0.1:4198` and serves the existing production build. Keep the terminal open. `DESK_PORT` overrides the port; `DESK_LOCAL_STORE` overrides the SQLite path. The default review store is `~/.underwriting-desk/reviews.sqlite`, created only when the workstation is started. This local SQLite database now stores both the review inbox and versioned analyst workspaces; source packages remain browser-managed, so it is not a complete canonical deal database migration.

Configure a compatible local MCP client with its absolute Node executable as command and these arguments:

```text
/absolute/path/to/workbench/mcp-server/server.mjs
--review-store
/absolute/path/to/.underwriting-desk/reviews.sqlite
```

Use the same store path in both processes. The Desk's setup status returns the actual paths, including the Node executable, so GUI clients do not depend on shell PATH. The client receives only `list_prepared_reviews`, `get_review_context`, and `submit_evidence_review`. Selected evidence is an explicit snapshot; private notes and original file bytes are excluded. Responses remain proposals, digest-bound to the prepared packet, and require human review in the Desk.

`GET /__desk/review?setup=1` with `x-desk-local: 1` returns runtime availability and the last MCP initialize timestamp with the client's **self-reported** name. This records a past handshake; it does not authenticate the client, prove it is still online, or verify a model subscription. Cross-origin review requests are rejected. Local operating-system processes remain trusted; this is not multi-user enterprise authorization. No AI API calls or provider setup occur when starting the workstation.

For Vite development, set `DESK_LOCAL_STORE` explicitly before running `pnpm dev`. Without it the review endpoint is disabled. Run `node --test mcp-server/*.test.mjs` to verify static MCP, store exchange, handshake status, and standalone routing protections.

## Durable analyst workspaces

The explicitly enabled local runtime hydrates analyst workspace state from SQLite before accepting edits. An empty database can initialize from a validated browser copy; an existing database always wins over browser state. Writes use an independent server version with transactional compare-and-set. Revision rows are append-only and protected against update/delete by SQLite triggers. These are local integrity controls, not authenticated audit or tamper-proof storage against the device owner.

A stale window receives a conflict, pauses edits, and offers its unsaved copy for download before reloading. Saving is serial per window; pending queued writes drain on internal navigation. A browser close warning applies while work is unsaved. Requests time out after ten seconds; uncertain outcomes require reloading the durable record rather than retrying an overwrite. Full scenario, evidence, approval and integrity validation runs on UI hydration and mutation; the local HTTP layer checks bounded state structure and deal identity.

`GET /__desk/workspace?deal=ID` returns `{available:true,workspace:null|{version,state}}`. `POST /__desk/workspace` accepts `{deal_id,baseVersion:null|number,state}` and returns `{version,state}` or HTTP 409 for conflicts. Both require the same local origin/header policy as the review API. MCP exposes no workspace read or write tools; private analyst notes remain outside the selected-evidence review surface. Static hosted builds continue using browser storage without probing local services.
