# Claude Code final model-workflow review

Provider: `claude`
Mode: `READ_ONLY`
Mission: `underwriting-product-vertical-slice-20260901`
Exact candidate: resolve the full checked-out `HEAD` with Git immediately before review; do not accept a supplied shorthand.

## Absolute constraints

- Do not edit, create, delete, chmod, stage, commit, push, deploy, install, start servers, execute tests, or access credentials.
- Read repository bytes and git objects only.
- Do not invoke another provider or contact any third party.
- Codex remains the sole writer.
- Refuse the review if the exact candidate is not the checked-out `HEAD` or if tracked source is dirty.

## Review question

Does the candidate now provide a coherent, investor-usable answer to “why not just do the underwriting in Claude?” through a working canonical-deal-state workflow rather than a connection wizard or AI theater?

Inspect the connection center, MCP tool surface, optional proposal ledger, ledger import validation, named human review, IC memo insertion and disposition, supported package intake, deterministic finance/econometric boundaries, tests, documentation, threat model, and public claims.

## Required adversarial checks

1. A model cannot mutate retained package bytes, metrics, assumptions, thresholds, recommendations, approvals, or deterministic finance.
2. Imported proposals cannot smuggle an accepted state, cross-deal content, stale digests, or unknown evidence into the memo.
3. The UI does not claim a local ChatGPT, Claude.ai, or Grok connection where a hosted remote MCP service is required.
4. The in-product adapter does not collect provider keys or overstate a capability probe as successful model inference.
5. The ordinary workflow is legible to an investor and materially stronger than a transient chat transcript.
6. Unsupported arbitrary ingestion, confidential-data readiness, multi-user persistence, and remote-provider deployment remain explicit limitations.

## Required response

Return exactly:

1. `EXACT_COMMIT_REVIEWED:` full SHA or `UNVERIFIED`
2. `WRITES_PERFORMED:` must be `0`
3. `CANONICAL_STATE_BOUNDARY:` `PASS` or `FAIL` with evidence
4. `MODEL_PROPOSAL_BOUNDARY:` `PASS` or `FAIL` with evidence
5. `INVESTOR_WORKFLOW:` `PASS` or `FAIL` with evidence
6. `CLAIM_DISCIPLINE:` `PASS` or `FAIL` with evidence
7. `FINDINGS:` severity-ranked, with exact paths; use `NONE` if no actionable finding
8. `VERDICT:` exactly `PORTFOLIO_CANDIDATE_READY` or `QUALITY_SHORT`
