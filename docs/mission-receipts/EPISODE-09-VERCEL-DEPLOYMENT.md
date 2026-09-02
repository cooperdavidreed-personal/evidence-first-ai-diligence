# Episode 09 — Vercel public deployment

- Recorded: `2026-09-01T18:01:05Z`
- Branch at upload: `codex/underwriting-product-vertical-slice`
- Source branch head at upload: `3af58b495ec536cd7ce7b177221b69ff57d53f3e`
- Exact product implementation: `85f379ddbb329354421076f6ae5569058a7c8133`
- Public URL: `https://underwriting-desk-delta.vercel.app/`
- Vercel project: `underwriting-desk`
- Vercel scope: `cooperdavidreed-personal`
- Deployment ID: `dpl_4uE7h1pEe5XBXKh11QqNNFpS5ERw`
- Status: `READY`

## Authorization and method

Cooper explicitly confirmed `2FA done; deploy.` The existing authenticated Vercel Drop to Deploy flow contained the previously built and verified `workbench/dist` artifact. Codex dismissed the completed account-security confirmation, named the project `underwriting-desk`, and submitted the deployment. No GitHub App was installed and no repository, account, team, permission, domain, billing, environment-variable, or provider-credential setting was changed.

This was a direct production static-artifact deployment, not a Git integration. The upload contained 39 files totaling 23,151,718 bytes. The temporary upload archive had SHA-256 `5e11aac7c352e45de85bbf134aef9cdee35e076232d753d7b3c12b18b2947f7f`.

## Hosted verification

- Vercel success screen linked the stable production alias.
- An unauthenticated HTTP request to `/` returned `200`, `text/html; charset=utf-8`, and the expected 595-byte application shell.
- The hashed JavaScript application asset returned `200` with `application/javascript; charset=utf-8`.
- Ordinary browser navigation loaded Deals with two retained illustrative cases and the supported intake entry point.
- AtlasGrid opened at `#/v3/atlasgrid/overview`; Diligence displayed five human-owned blocking issues, the plain-language renewal test, proposal-ledger import, and honest unavailable-inference state.
- The model connection center opened and distinguished the local Claude Code/Codex MCP path from hosted Claude.ai/ChatGPT/Grok paths that require a future authenticated remote MCP service.
- Helios opened at `#/v3/helios/memo` with the deterministic `HOLD` conclusion and the committee draft.
- Browser warnings and errors captured during the hosted flow: `0`.
- Authentication wall on the public application: none observed.

## Honest boundary

- Git-backed continuous deployment: `NOT CONFIGURED`.
- Server-side model inference and hosted remote MCP: `NOT IMPLEMENTED`.
- Runtime persistence, authentication, multitenancy, confidential-data readiness, and enterprise security: `NOT CLAIMED`.
- Vercel runtime observability: `NOT ESTABLISHED`; this static deployment has no application functions.
- Public deployment proves that the reviewed static workflow is reachable. It does not prove practitioner adoption, real-company accuracy, investment performance, or comprehensive accessibility.

## Verdict

`PUBLIC_DEPLOYMENT_VERIFIED`
