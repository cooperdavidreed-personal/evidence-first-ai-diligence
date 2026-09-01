# Underwriting Desk local MCP surface

This local stdio server reads the retained public case JSON and creates in-memory proposals. It does not call a model, access private files, use network transport, persist proposals, or mutate the canonical case.

Run locally:

```bash
node mcp-server/server.mjs
```

Read tools: `list_deals`, `get_decision`, `get_decision_tests`, `list_issues`, `get_metric_lineage`, `search_package`, and `list_analyses`.

Proposal tools: `propose_observation`, `propose_diligence_request`, and `propose_memo_section`. Every successful proposal returns `status: PROPOSED` and `approval_state: PROPOSED`. Human acceptance or rejection occurs outside MCP; there is intentionally no approval, decision, assumption, metric, threshold, or package-state mutation tool.

`tools/call` must include a JSON-RPC request id. Id-less tool-call notifications are dropped without execution so a client cannot create an invisible, unacknowledged proposal. Other unknown notifications are silent as required by JSON-RPC.
