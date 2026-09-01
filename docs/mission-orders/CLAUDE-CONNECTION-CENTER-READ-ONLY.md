# Claude Code connection-center and product-moat review

Provider: `claude`
Mode: `READ_ONLY`
Mission: `underwriting-product-vertical-slice-20260901`
Exact checkpoint: `740fa62709b66c5c98c88447afc3a259ec95a6c9`

## Absolute constraints

- Do not edit, create, delete, chmod, stage, commit, push, deploy, install, start servers, execute tests, or access credentials.
- Read repository bytes and git objects only.
- Do not invoke any provider or contact any third party.
- Codex remains the sole writer.

## Product question

An investment professional challenged the product with: "Why is this meaningfully better than doing the underwriting and decision process directly in Claude?"

Review the current product, model workflow, MCP server, deal intake, deterministic engines, evidence lineage, approval boundary, and IC export. Recommend the smallest coherent implementation that makes the answer visible in ordinary product use rather than in marketing copy.

The intended connection center must distinguish:

1. external model clients using the local stdio MCP server;
2. remote model clients that require a hosted HTTPS MCP endpoint;
3. in-product model review using an operator-controlled API adapter endpoint;
4. unsupported or not-yet-implemented paths.

The public browser must not collect raw provider credentials. The public product remains synthetic/public-data only. The Lab must remain canonical; models may read and propose but may not silently change metrics, assumptions, thresholds, recommendations, approvals, or retained package state.

## Required review

Assess:

1. the strongest defensible differentiation from a general-purpose frontier-model workspace;
2. the highest-value missing workflow proof that can be implemented without auth, multitenancy, private-data storage, or a broad hosted MCP service;
3. a calm, investor-native onboarding wizard information architecture;
4. failure modes that would make the wizard feel like AI theater;
5. exact acceptance tests for connection configuration, approval scope, and no-canonical-mutation behavior.

## Required response

Return exactly:

1. `EXACT_COMMIT_REVIEWED:` full SHA or `UNVERIFIED`
2. `WRITES_PERFORMED:` must be `0`
3. `DEFENSIBLE_MOAT:` five or fewer ranked points
4. `IMPLEMENT_NOW:` bounded component and interaction list
5. `DO_NOT_PRETEND:` unsupported paths and wording to avoid
6. `ACCEPTANCE:` deterministic test list
7. `VERDICT:` exactly `CONNECTION_CONTRACT_READY` or `CONNECTION_CONTRACT_NOT_READY`
