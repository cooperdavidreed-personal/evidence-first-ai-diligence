# Cooper interview and portfolio guide

Status: `DRAFT FOR FOUNDER LEARNING — NOT A PUBLIC CLAIM`

## The one-sentence thesis

I built a shared PE and VC underwriting workbench that forces every important
number through a visible chain from retained evidence to estimate, investment
economics, decision gate, and operating action.

## Thirty-second explanation

Most AI diligence demos optimize for generating a memo. I optimized for the
harder part: knowing which numbers deserve decision credit. The project contains
two fully synthetic companies—a SaaS buyout and an AI-infrastructure growth
round—with deterministic accounting, causal and noncausal analyses, full return
mechanics, and clickable number-to-source lineage. The interface deliberately
separates an analytical posture from actual investment authority, so a model can
say `REPRICE` or `CONDITIONAL INVEST` while the workflow remains on `HOLD` for a
human decision.

## Two-minute explanation

The system starts with versioned synthetic data-room manifests rather than a
chat prompt. AtlasGrid plants realistic buyout distortions: active-only NRR,
subsidiary concentration, underburdened margin, challenged add-backs, booked ARR,
and leverage risk. Helios plants venture-specific problems: design-partner
selection, pipeline quality, compute unit economics, dilution, milestone
financing, runway, and preference waterfalls.

The Python layer precommits analysis specifications, reconciles money in integer
cents, runs the econometrics, and computes debt or capitalization outcomes. It
emits typed metrics, formulas, source locators, scenario books, decision records,
and receipts. The React layer consumes those generated contracts without a
runtime backend. A reviewer can move from a headline return to its business
meaning, formula, operands, source selection, and audit digest.

The investment insight is not “AI made a report.” It is that evidence quality
changes economics. AtlasGrid's seller definitions reduce normalized earnings and
reveal parent concentration, so the ask misses the hurdle and the posture becomes
`REPRICE`. Helios can support a first close, but the second tranche remains tied
to explicit operating evidence, and a failed milestone reruns cash, ownership,
preferences, and returns. Econometric results receive zero, scenario-only, or
bounded model credit depending on identification.

## Ten-minute walkthrough

1. Start on AtlasGrid's IC Snapshot. Explain `REPRICE` versus `HOLD`, `PENDING
   HUMAN`, and `PENDING FOUNDER SIGNATURE`.
2. Point to the selected $210M EV, $120M debt, $88M/$20M earnout mechanics, and
   23.3% gross XIRR. Then show that the $240M ask produces 17.6% and misses the
   22% hurdle.
3. Use the 60-second IC read: definition quality is the decisive driver; churn
   plus multiple compression is the loss case; covenant EBITDA is the gate.
4. Open the hurdle ledger. Say explicitly: “Clearing the quantitative hurdle is
   necessary in this illustrative rule set; it is not investment approval.”
5. Open Gross IRR lineage. Walk through business meaning, dated XIRR operands,
   retained source evidence, then hashes last.
6. Search the deal room for “covenant.” Show that the product retrieves the
   request, owner, consequence, and relevant evidence—not just a filename.
7. In the Econometric Lab, compare association/abstention with identified
   synthetic effects. Explain why observed price slope gets zero credit and why
   even a randomized synthetic effect does not automatically transfer to a real
   portfolio company.
8. In the Underwriting Room, switch among seller ask, selected, and downside;
   then change exit multiple. Explain that each displayed state is a retained
   engine result, and the URL captures the selected state.
9. Switch to Helios. Explain why $25M closes first and $15M is conditional, why
   current and funded runway differ, and why the milestone failure must rerun the
   capitalization and cash model.
10. End on Value Creation. Show that an initiative needs a baseline, target,
    owner, cost, milestone, stop rule, evidence class, and reconciled economic
    bridge before it receives credit.

## Architecture you should be able to draw

```text
Synthetic source room
  → content-addressed manifest
  → precommitted analysis specification
  → accounting / econometric / finance engines
  → typed metrics + formulas + source locators
  → scenario + decision + value-creation contracts
  → static IC workbench
  → human review and signature
```

The browser is a reader and scenario navigator. It does not contain hidden truth,
recompute the core models, call a hosted LLM, or possess investment authority.

## Hard questions and honest answers

### Is this enterprise-grade?

It is engineered as a portfolio-grade local reference implementation with
versioned contracts, deterministic tests, security gates, browser evidence, and
independent review. It is not enterprise-proven: there is no live deployment,
private data integration, institutional user study, or production operating
history.

### Why synthetic data?

Private-company data could not be published responsibly. Synthetic cases let me
make the planted distortions, causal truth, and expected recovery conditions
testable while publishing the entire reasoning chain. That proves system design
and analytical discipline, not real-world investment accuracy.

### What did AI do?

Multiple frontier models provided read-only architecture, research, and
adversarial critique. Codex was the sole filesystem writer. Provider prose never
became case evidence; deterministic contracts and tests decided what entered the
candidate. Human investment authority stayed outside every model.

### What is differentiated from an analyst's AI memo tool?

The unit of work is not prose. It is a reproducible decision dependency graph:
source selection, estimand, calculation, scenario consequence, hurdle, gate, and
operating initiative. The same contracts work across control-buyout debt and
venture capitalization mechanics.

### What would you build next with real firm access?

I would begin with read-only ingestion into the same manifest and locator
contracts, add role-based access and retention controls, validate the metric
definitions with the deal team, and run a shadow comparison against completed
diligence. I would not enable autonomous recommendations or write-back actions.

### What can fail?

Source definitions can be wrong, causal assumptions can fail, scenario priors can
be poorly calibrated, a metric can be precisely computed but irrelevant, and a
clean interface can create false confidence. The system responds with explicit
abstention, zero credit, open gates, falsifiers, and human signature requirements.

## Resume and LinkedIn draft boundary

After anonymous public verification and founder approval, a supportable draft is:

> Built an evidence-bound PE/VC underwriting workbench spanning synthetic SaaS
> buyout and AI-infrastructure growth cases; linked accounting, econometric,
> scenario, and value-creation outputs to content-addressed source selections and
> reproducible analysis receipts.

Do not claim investment outperformance, proprietary data access, production
adoption, comprehensive accessibility, model superiority, or enterprise proof.
