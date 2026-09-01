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
