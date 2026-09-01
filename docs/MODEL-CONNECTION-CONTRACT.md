# Model connection contract

## Product boundary

The Underwriting Desk is the canonical deal state. A frontier model is a replaceable reviewer, not the calculator, source of record, approval authority, or investment decision-maker.

The Desk owns:

- validated deal inputs and retained source lineage;
- deterministic finance, econometric results, and policy thresholds;
- evidence and assumption classifications;
- proposal disposition by a named human;
- the committee memo and its export boundary.

Models may contribute only evidence-linked observations, diligence requests, challenges, and draft memo language. They cannot change metrics, assumptions, thresholds, package state, analytical posture, recommendation, approval, or retained source bytes.

## Supported connection routes

| Route | Current state | What works | Limitation |
|---|---|---|---|
| Claude Code or Codex via local MCP | `AVAILABLE_LOCALLY` | Seven read tools, three proposal tools, optional local JSONL handoff, browser import, named human review, accepted memo output | Retained illustrative cases only; the browser cannot verify client installation |
| In-product API adapter | `OPERATOR_CONFIGURED_ONLY` | A compatible HTTPS endpoint can advertise the evidence-challenge contract and receive only a user-confirmed evidence subset | No provider endpoint or credentials ship in the public build; real provider inference remains `NOT RUN` unless separately configured |
| Claude.ai, ChatGPT, or Grok via remote MCP | `NOT_IMPLEMENTED` | The connection center explains the required hosted architecture | Requires hosted HTTPS transport, authentication, tenant isolation, and provider/workspace permissions |

The browser never asks for a Claude, OpenAI, or xAI API key. A provider subscription is not treated as an API credential.

## Local proposal handoff

1. The operator launches the local stdio MCP server with `--proposal-ledger <absolute-path>`.
2. A compatible model client calls one of the three proposal tools.
3. The server validates canonical evidence references and appends a proposal bound to the deal, manifest digest, and analysis digest.
4. The analyst imports the JSONL file from the retained deal's Diligence view.
5. The browser rejects malformed, cross-deal, digest-mismatched, or unknown-evidence entries and forces admitted items to `PROPOSED`.
6. A named human accepts or rejects each proposal.
7. Only accepted memo drafts enter the IC memo; the disposition ledger records reviewed items.

This handoff is local and session-scoped. It is not synchronization, shared persistence, a remote connector, confidential-data readiness, or a production multi-user workflow.

## Why this is different from doing the work in chat

A general-purpose chat can reason over documents, but the model usually owns the temporary context, calculations, and narrative. The Desk reverses that relationship: the deal package, formulas, thresholds, evidence bindings, and approval state remain stable while Claude, Codex, ChatGPT, Grok, or another model can be replaced. A model can challenge the case, but it cannot silently become the case.
