# Unified review and repair ledger

Status: `CANDIDATE 3c44098 — FINAL RE-REVIEW PENDING`

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

## Claude Fable 5.1 — exact-commit re-review at `0ed9a57`

The native Claude review was read-only, began and ended with a clean worktree, and returned `QUALITY_SHORT`. The following findings were treated as release defects rather than as a model-vote exercise.

| Severity | Finding | Decision | Repair or retained limitation |
|---|---|---|---|
| `HIGH` | The local verification receipt was bound to an earlier source commit. | `ACCEPT` | Regenerated the entire deterministic release surface after the repairs. The next immutable candidate commit and this receipt are rebound before final re-review; GitHub CI must still bind the public merge commit. |
| `HIGH` | Helios displayed a seeded 20% loss frequency as if it independently validated the selected 20% catastrophe prior. | `ACCEPT` | Created separate typed metrics. The selected catastrophe prior is an analyst-owned scenario input; the replay loss frequency remains a formula-backed generator check. Only the selected prior is screened against the separate Desk loss ceiling. The UI, decision record, PDFs, metric contract, and tests now state the structural relationship. |
| `MEDIUM` | The local MCP accepted 20 evidence references while the canonical workspace accepted eight. | `ACCEPT` | Both interfaces now enforce the same maximum of eight and fail closed on nine. |
| `MEDIUM` | Northstar's 83.6% eleven-month ratio was labeled annual NRR. | `ACCEPT` | Relabeled it `Cohort retention proxy`, states the 11-month interval in the default view, and explicitly says it is not annual NRR. It still creates a concern against the separate annual-NRR screen. |
| `MEDIUM` | GitHub Pages could republish a second live application. | `ACCEPT` | Pages now publishes a canonical redirect plus evidence artifacts; it no longer builds or copies a second workbench application. |
| `MEDIUM` | Hosted review appeared available for any valid imported package although the server registry supported only retained cases and one exact sample. | `ACCEPT` | The product now enables hosted review only for registered retained cases and the exact supported Northstar sample. Other browser-local packages receive an honest unavailable state rather than a failing control. |
| `MEDIUM` | Imported portable state could carry policy exceptions as if they retained local authority. | `ACCEPT` | Portable imports strip policy overrides and demote imported proposal provenance. A new local human action is required for any authoritative exception. |
| `LOW` | System labels could appear as named human actors; AtlasGrid type and Helios ownership wording were imprecise; residual Lab branding remained in PDFs. | `ACCEPT` | System identities are rejected as human names, AtlasGrid is labeled buyout, Helios ownership is described after close and pool refresh, and current PDF footers use Underwriting Desk. |

### Post-repair deterministic evidence

- Python/kernel: `188/188 PASS`.
- Mutation gates: `16/16 declared`, including 13 dynamic and one static gate; whole-program mutation score remains `NOT_CLAIMED`.
- React/API: `107/107 PASS`; MCP: `9/9 PASS`.
- Browser: `38 passed`, `8 intentional skips`, `46 discovered` across desktop and mobile.
- Visual baselines: `40/40 PASS`; accessibility evidence: `8/8 PASS` for the declared automated checks.
- PDFs: `6/6 PASS`, 36 pages total, tagged and metadata normalized.
- Public scan: `PASS` over 414 candidate files.

The deployed hosted-inference roundtrip, Git-backed Vercel deployment, final film, and observed practitioner usability remain external release gates and are not inferred from these local results.

## Release rule

Any unresolved critical or high product defect in the clean-commit Claude or Grok re-review returns this candidate to `QUALITY_SHORT`. Practitioner testing may begin only after the public deployment, hosted proposal flow, document set, demonstration, and exact-commit evidence pass.
