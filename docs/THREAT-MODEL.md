# Threat model

Protected properties are source provenance, cutoff integrity, calculation
correctness, explicit uncertainty, local filesystem containment, and human
decision authority.

| Threat | Current control | Residual limitation |
|---|---|---|
| Path traversal or symlink escape | descriptor-relative reads with `O_NOFOLLOW` | platform semantics require CI evidence |
| Source mutation | declared and recomputed SHA-256 | publisher authenticity is not established |
| Temporal leakage | publication date must be on or before case cutoff | supplied dates can be dishonest |
| Prompt injection in sources | bounded pattern quarantine | pattern matching is incomplete |
| Unsupported material claim | explicit evidence spans and fail-closed state | literal containment is not entailment |
| Incorrect financial arithmetic | decimal-string inputs and `Decimal` | formulas can encode the wrong business meaning |
| Automated investment action | no trading, messaging, or recommendation interface | humans can still misuse the packet |
| Model proposal becomes canonical fact | MCP has read and proposal tools only; browser import revalidates deal digests and evidence refs and forces `PROPOSED` | a human can still accept weak language |
| Proposal-ledger tampering | malformed, cross-deal, digest-mismatched, duplicate, and unknown-evidence lines fail closed | local ledger authenticity and multi-user authorship are not established |
| Uploaded package grades itself | package thresholds remain management representations; Desk-owned policy is stored separately and only an explicitly overridable gate accepts a named policy-owner exception | the illustrative public policy is not an adopted firm mandate |
| Portable bundle injects calculated output | admitted deal import replays bounded source payloads through the intake engine and rejects output or identity drift | supported schema is narrow; arbitrary data rooms are not accepted |
| Hosted-model prompt or citation escape | exact evidence subset confirmation, request digest, structured schema, admitted-reference validation, output limits, and browser revalidation | semantic quality and indirect prompt injection are not fully solved |
| Cross-site use of the public model route | exact `Origin` equality and `Sec-Fetch-Site` checks | this is a browser cross-site-request boundary, not authentication; a direct client can still call a public endpoint |
| Public endpoint spend abuse | 12 KB request ceiling, at most eight evidence items, 1,500 output-token ceiling, in-process defense-in-depth limiter, and live Vercel firewall rule `rule_synthetic_model_challenge_rate_limit_SOKNGR` at five requests per IP per 600 seconds | distributed callers can use multiple IPs; no global provider budget ceiling is claimed until one is configured and verified |
| Hosted provider unavailable or un-funded | the route returns a generic `503`, retains deterministic analysis, and creates no proposal | the public model workflow is not available until the project has usable AI Gateway credit and provider availability |
| Browser-local data exposure | explicit synthetic-only boundary, no provider key in the client, validated import/export, private note excluded by default | browser storage is not encrypted, authenticated, shared, or confidential-data-ready |
