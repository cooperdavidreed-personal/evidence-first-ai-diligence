# Cooper interview and portfolio guide

Status: `DRAFT FOR FOUNDER LEARNING — NOT A PUBLIC CLAIM`

## The one-sentence thesis

I built an evidence-linked PE and VC underwriting workspace in which the Desk,
not the language model, owns the source package, deterministic calculations,
policy, scenarios, approvals, and final investment record.

## Thirty-second explanation

Most AI diligence demos optimize for generating prose. This project makes the
decision record the product: sources remain distinct from assumptions and fund
policy; calculations are deterministic; what-if cases cannot overwrite the
canonical case; and model output begins as a cited proposal that a named human
must accept, reject, or edit. The public release uses fictional companies and
synthetic records so the full workflow can be reproduced without exposing
private deal data.

## Two-minute explanation

The Desk has three working entry points. AtlasGrid is a synthetic SaaS buyout
with debt, price, covenant, concentration, margin, retention, and return
mechanics. Helios is a synthetic AI-infrastructure growth investment with
cohorts, unit economics, runway, financing events, dilution, preferences, and
probabilistic returns. Northstar is a supported four-file browser-local intake
that proves an uploaded company package cannot grade itself: package hurdles are
retained as representations, while Desk-owned draft screening policy remains a
separate registry.

The important Northstar result is deliberately uncomfortable. Its package
reconciles to $15.9 million of LTM revenue, 70.0% gross margin, 83.6%
11-month opening-cohort retention proxy (not annual NRR), 33.3% post-money ownership, 3.23x gross MOIC, and 26.5%
annualized gross return. The return screens clear, but the 83.6% proxy is a
retention concern and six other evidence or policy gates keep the posture at `SCREENING COMPLETE — FURTHER DILIGENCE
REQUIRED`. Missing or changed required files suppress the return conclusion and
produce `NO CALL — PACKAGE INCOMPLETE`.

Inside a deal, a practitioner can inspect source-linked evidence, change a
bounded scenario, see deterministic consequences, write notes, manage diligence
issues, disposition assumptions, review fund-owned policy, request a bounded
model challenge, make a named human decision on the proposal, edit the memo, and
export portable state. Technical receipts and methodology are available through
progressive disclosure instead of dominating the investment workflow.

## Eight-minute unguided walkthrough

1. Start on Deals. Open Helios and state the posture: `HOLD` because the selected
   unreviewed 20.0% analyst catastrophe prior exceeds a separate Desk-owned draft
   10.0% loss ceiling. The seeded replay is a generator check, and the 8.2x
   milestone-case upside is not the recommendation.
2. Open Financials. Change one authorized what-if input and show the returns and
   decision consequence update while the canonical case remains unchanged.
3. Open Documents. Search for a metric and inspect an exact source excerpt,
   period, value, and downstream calculation.
4. Open Diligence. Add a named human observation, assign an issue, and show the
   separate assumption and policy registries.
5. Open Model review. Select the exact evidence subset, confirm the transfer,
   run the bounded challenge, and show that the response begins as `PROPOSED`.
6. Enter a reviewer name, accept or reject the proposal, then open IC Memo and
   add an accepted proposal with provenance.
7. Return to Deals, choose New deal, download and import the Northstar package,
   and point to the 83.6% 11-month retention-proxy concern beside the clearing
   3.23x / 26.5% return case.
8. Remove or modify a required file and rerun intake. Show `NO CALL — PACKAGE
   INCOMPLETE` with return conclusions suppressed.

## Architecture you should be able to draw

```text
Synthetic or supported public package
  -> browser-local validation and source replay
  -> source facts / deal terms / assumptions / fund policy kept separate
  -> deterministic finance and bounded empirical analysis
  -> canonical case plus explicitly unapproved what-if cases
  -> evidence-linked issues, observations, approvals, and memo
  -> selected-evidence model proposal (PROPOSED only)
  -> named human acceptance, rejection, or edit
  -> portable deal state and IC output
```

## Hard questions and honest answers

### Is this enterprise-grade?

No. It is a rigorously tested public career product and synthetic reference
implementation. It has no authentication, multitenancy, confidential-data
controls, firm adoption, or production operating history. The release is ready
for unguided practitioner testing only after the final public verification and
the testing results themselves remain `NOT RUN` until real participants complete
the protocol.

### Why synthetic data?

Private-company data cannot be published responsibly. Synthetic cases make the
planted distortions, causal boundaries, and expected recovery conditions
testable while allowing the full reasoning chain to be shared. That proves
system design and analytical discipline, not real-world investment accuracy.

### Why not just use Claude or ChatGPT with Excel?

A general model is useful for reasoning and drafting, but its session usually
owns the temporary context and narrative. The Desk preserves a typed,
replayable decision state across models: source selections, calculations,
policy, scenario boundaries, approvals, and memo provenance remain stable.
Models can challenge the case; they cannot silently become the case. The claim
is still a hypothesis until experienced practitioners complete the unguided test.

### What did AI do?

Codex performed implementation and repository work. Claude, Grok, and ChatGPT
were assigned bounded advisory or review roles. Provider prose never became
case evidence, and model agreement was never treated as acceptance. Deterministic
tests, source replay, visual inspection, and human review remain authoritative.

### What does the hosted model workflow prove?

It proves a narrow synthetic-only pattern: the user selects evidence, confirms
the transfer, receives cited proposals, and must make a named human disposition.
It does not prove confidential-data readiness, remote MCP, identity, role-based
authority, cost governance at firm scale, or model accuracy.

### What would you build next with real firm access?

Begin with read-only ingestion into the same source and policy contracts; add
identity, role-based access, retention and deletion controls; validate firm
metric definitions; then run a shadow comparison against completed deals. Do
not enable autonomous recommendations or write-back actions.

### What can fail?

Source definitions can be wrong, causal assumptions can fail, scenario priors
can be poorly calibrated, a metric can be precise but irrelevant, and a clean
interface can create false confidence. The product responds with abstention,
zero-credit treatment, visible gates, falsifiers, source replay, and required
human disposition—but none of those controls guarantees a good investment.

## Resume and LinkedIn draft boundary

Only after the public commit, deployment, final artifacts, and founder approval
are verified, a supportable draft is:

> Built a public evidence-linked PE/VC underwriting workspace across synthetic
> SaaS buyout, AI-infrastructure growth, and browser-local intake cases;
> separated deterministic finance, fund policy, scenarios, evidence lineage,
> human approvals, and governed model proposals in a reproducible decision
> workflow.

Do not claim investment outperformance, proprietary data access, production
adoption, comprehensive accessibility, model superiority, practitioner
validation before testing, or enterprise security.
