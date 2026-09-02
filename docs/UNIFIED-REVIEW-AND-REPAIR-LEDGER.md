# Unified review and repair ledger

Status: `CLAUDE SOURCE ACCEPTED — LOCAL REPAIRS VERIFIED — EXTERNAL RELEASE GATES OPEN`

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
| `MEDIUM` | Northstar's 83.6% eleven-month ratio was labeled annual NRR. | `ACCEPT` | Relabeled it `Cohort retention proxy`, states the 11-month interval in the default view, and explicitly says it is not annual NRR. The final repair further blocks any sub-annual proxy from clearing the 12-month screen. |
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

## Claude Fable 5.1 — clean candidate acceptance at `b4435e0`

Claude reviewed exact commit `b4435e06e2bb9483fdedf42c9754463ac4d698df`, confirmed a clean and unchanged worktree, performed no writes or delegation, and returned `PORTFOLIO_CANDIDATE_READY`. Scores were 4/5 for finance, econometrics, decision integrity, visual presentation, security/claims discipline, and career signal; 3/5 for investor usability and differentiation.

The review explicitly confirmed:

- Northstar package thresholds cannot grade the case; the 83.6% 11-month proxy remains a locked concern and incomplete packages suppress returns.
- Helios analyst prior, Desk ceiling, package representation, financing ownership, and preference seniority remain separate and reconcile.
- Hosted and local proposals are evidence-bound at the registry, request, workspace, and portable-import layers.
- Portable imports cannot delete canonical issues, rewrite deterministic memo text, preserve policy overrides, or retain trusted proposal origin.
- AtlasGrid sources and uses, normalized EBITDA, debt schedule, selected returns, downside floor, maximum bid, and provisional `REPRICE` language reconcile.

Claude classified the unavailable live AI Gateway roundtrip as an external high release gate, not a code defect. It also identified stale founder-guide wording, an over-strong continuous-path sentence, ambiguous Northstar gate counts, an over-broad README sentence, and provider-error reflection. These were accepted and repaired: the guide now uses prior-versus-policy and 11-month-proxy language; the replay statement is seed-observed rather than structural; the rail splits one investment concern from evidence/policy gaps; the README matches the actual receipt and interface contract; and arbitrary upstream error text is no longer returned to the browser.

## Claude Fable 5.1 — exact source review at `c4eedec`

Claude reviewed exact clean commit `c4eedec04bb2411a0787dfecc69244216fd4148a` and returned `QUALITY_SHORT`. Its only high finding was release-evidence drift: the committed receipt still named an earlier source commit. The complete verifier was subsequently run against exact source commit `ebb2b8c4fe4db33224613e22ff4ccfd7f2fa2874`, producing 189 Python/kernel passes, 111 React/API passes, 9 MCP passes, 38 active browser passes, 40 visual matches, 8 accessibility evidence matches, 6 PDF passes, and a 414-file public scan.

The review's three substantive medium integrity findings were also repaired rather than deferred:

- A sub-annual retention proxy can no longer clear an annual NRR screen. Northstar's 83.6% across 11 months is visibly `BLOCKED`; a 96% three-month regression fixture is also blocked.
- The Helios Desk loss ceiling appears only in the policy registry, not in the human assumption-approval registry.
- Python and browser contracts now grade the selected analyst catastrophe prior against the Desk ceiling; replay loss frequency remains a separate generator check.

Additional accepted repairs place an explicit source-identity caveat in printed memo text for imported proposals, use exact decimal comparison for local what-if screens, declare browser security headers in Vercel configuration, correct unsupported-file retention language, and mark the retired Lab contract as superseded. A production-equivalent Vercel build emits only `api/challenge`; public scanning now fails closed if tests or helpers enter the auto-discovered API directory.

## Grok — final exact-candidate attempt

The bounded native Grok Build attempt against the clean candidate ended `HELD_PROVIDER` because the signed-in free usage allowance was exhausted. No API key, paid route, identity change, or fallback was used. Grok returned no final verdict, so no acceptance credit is claimed. This provider hold does not replace deterministic verification or the required practitioner test.

## Claude Fable 5.1 — final source acceptance and retained repairs

Claude reviewed exact clean commit `4d964c99753a5f9b27348c90c8864066fe415e91`, made no writes, and returned `PORTFOLIO_CANDIDATE_READY` with no unresolved critical or high source defect. It scored finance, econometrics, decision integrity, visual presentation, and career signal at 4/5; investor usability, differentiation, and security/claims discipline at 3/5. The two external highs were correctly retained as release gates: a successful anonymous hosted proposal roundtrip and a Git-backed public deployment bound to the default-branch commit.

Claude also identified six medium or release-hygiene items. The source repairs were accepted and completed in `c974440489f96875e4eaf0c0259a635854654c1b`:

- The root vertical-slice receipt and legacy film documents are explicitly marked superseded; `demo/final/` is the current production contract.
- The Helios 18.0-month policy screen is explicitly a post-close modeled-runway floor, separate from the 17.3-month recent pre-financing runway.
- The decision rail now separates immutable canonical conditions from editable worklist items; closing a task cannot make an investment condition disappear.
- A complete uploaded package that misses deterministic return screens receives `HOLD` rather than a generic screening-complete posture.
- The final film remains blocked until the same live source, hosted proposal, PDFs, and exact public commit can be captured honestly.

The exact-candidate replay at `c974440` passed 113 React/API tests, 9 MCP tests, 40 active browser journeys, 40 visual baselines, 8 accessibility evidence checks, all six PDFs, and the 415-file public scan. The Python/kernel surface is byte-identical to `ebb2b8c`, where the complete 189/189 run passed.

## Release rule

Any unresolved critical or high product defect in the clean-commit Claude or Grok re-review returns this candidate to `QUALITY_SHORT`. Practitioner testing may begin only after the public deployment, hosted proposal flow, document set, demonstration, and exact-commit evidence pass.
