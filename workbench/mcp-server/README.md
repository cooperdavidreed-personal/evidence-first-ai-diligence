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

When enabled, the local JSONL ledger records the proposal plus the retained deal, manifest digest, analysis digest, and canonical evidence references. Importing it through **Diligence → Import proposal ledger** revalidates those bindings and forces every item back to `PROPOSED`, even if the file claims otherwise. Accepted memo language can then appear in the IC memo with the named human reviewer; refresh clears the browser review state.

The local MCP server can access only the two retained illustrative cases. It cannot access a browser-local Quick Package deal. Claude.ai, ChatGPT, and Grok require a hosted HTTPS MCP server; that remote authenticated service is not implemented in this public slice.

`tools/call` must include a JSON-RPC request id. Id-less tool-call notifications are dropped without execution so a client cannot create an invisible, unacknowledged proposal. Other unknown notifications are silent as required by JSON-RPC.
