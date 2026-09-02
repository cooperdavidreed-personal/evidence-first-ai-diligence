# Unified review and repair ledger

Status: `FINAL RE-REVIEW PENDING`

This ledger records independent criticism of candidate `36060ec4bd94e3dfea189aa4046f5c594e119c8c` and the product decisions made before the final clean-commit review. Review agreement is advisory; tests, source replay, deterministic recomputation, rendered evidence, and named human judgment remain the acceptance basis.

## Claude Fable 5.1 — finance, econometrics, and product architecture

| Finding | Decision | Repair or retained limitation |
|---|---|---|
| Helios package-authored risk hurdles could still be mistaken for the policy that grades the investment. | `ACCEPT` | Added a separately versioned Desk policy outside the data room. Helios decisions and sensitivity tests now bind to that policy; the package hurdle remains an untrusted company representation. |
| Econometric evidence inspection could select the wrong metric and AtlasGrid described a percentage-point estimate as log points. | `ACCEPT` | Bound the drawer to the exact case-specific metric, corrected unit conversion, and added regression tests for both retained cases. |
| A quantitative hurdle issue could be resolved through free text. | `ACCEPT` | Locked quantitative-hurdle issues; they require governed policy or evidence change rather than a cosmetic status edit. |
| Edited model-derived memo language could lose its relationship to the accepted proposal. | `ACCEPT` | Preserve the accepted proposal body as source provenance and classify later copy as analyst judgment. Portable import rejects a missing or mismatched accepted source proposal. |
| Helios sensitivity cells repeated HOLD without showing why. | `ACCEPT` | Each selected cell now exposes the return-hurdle and loss-screen consequences while retaining the conditional HOLD posture. |
| Public server execution and the canonical deployed commit were unverified. | `ACCEPT` | Remains a hard release gate; no hosted-model or deployment claim is promoted until anonymous execution and exact-commit checks pass. |

## Grok — skeptical growth investor and substitution challenge

| Finding | Decision | Repair or retained limitation |
|---|---|---|
| The connection wizard offered model routes that were not actually usable. | `ACCEPT` | The default route is the bounded in-product evidence challenge. Remote ChatGPT/Grok MCP is removed from ordinary product navigation and remains future architecture in documentation. |
| The career guide described the retired Lab interface and stale behavior. | `ACCEPT` | Rewritten around the five-destination Desk, Northstar intake, canonical/what-if state, and honest hosted-model limits. |
| Browser-restored Northstar state was not replayed through source calculations. | `ACCEPT` | Local restore now replays the admitted source payload before showing calculations; tampering fails closed. |
| Partner packets exposed Monte Carlo standard-error detail. | `ACCEPT` | Moved the sampling diagnostic to the technical appendix; partner packets retain plain-language scenario-path disclosure. |
| A public-demo reviewer or policy-owner name is not authenticated identity. | `ACCEPT` | The interface now states that names and roles are self-declared in this browser-local demonstration. Authentication and enterprise authority remain out of scope. |
| The product has not yet defeated Claude-plus-Excel through observed practitioner use. | `ACCEPT AS TEST HYPOTHESIS` | Prepared a four-role unguided protocol and feedback schema. Results remain `NOT RUN`; no practitioner-validation or model-superiority claim is permitted. |
| The Deals list is retained-case catalog metadata rather than a shared live pipeline. | `DEFER` | Accurate for the bounded public demo. Multi-deal shared workflow, authentication, and operating-cadence synchronization are explicitly outside this release. |

## ChatGPT / hiring-decision review

The final package will be sent to Cooper's personal ChatGPT only after the canonical URL, exact commit, refreshed PDFs, and final demonstration agree. It will be asked to inspect the public product as a practitioner and hiring decision-maker. Its response will be treated as advisory input, not fabricated practitioner evidence or financial validation.

## Release rule

Any unresolved critical or high product defect in the clean-commit Claude or Grok re-review returns this candidate to `QUALITY_SHORT`. Practitioner testing may begin only after the public deployment, hosted proposal flow, document set, demonstration, and exact-commit evidence pass.
