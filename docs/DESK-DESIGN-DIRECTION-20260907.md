# Design direction: an investment workpaper

## Candid assessment

The product now has useful state and control mechanics. Its weak spot is the consistency of the working experience: the entry page differs from the deal shell, some destinations still read like long reports, controls have accumulated across several styling passes, and some explanatory language describes implementation instead of the analyst's next action. Repeated metrics make a screen look busier without making it more useful. Two retained cases and one admitted slot also constrain how convincing a broader deal-operations story can be.

A different model, Tailwind, a component library, or a skyline will not independently solve this. Those are execution tools. The missing input is a precise visual and interaction standard, evaluated against a real underwriting task. Professional appearance is feasible here; production enterprise readiness additionally requires identity, access control, collaboration, recovery, support, and validation that this local demonstration does not claim.

## Three directions worth considering

| Direction | Screen composition | Best use | Risk |
|---|---|---|---|
| Investment workpaper — recommended | Quiet navigation, contextual deal header, broad evidence/comparison table, adjustable source inspector | Analyst and VP reviewing evidence and decision consequences | Dense tables become unreadable if everything becomes a column |
| Deal operations desk | Work queues organized by owner, blocker, evidence arrival, and next committee action | Repeat daily use by a deal team | Implies multi-user operations and pipeline completeness we do not yet provide |
| Committee brief | A concise investment argument with inline economic exhibits and expandable source support | Partner review and career presentation | Can regress into a polished report without enough working controls |

Use the investment workpaper as the primary interface, with the committee brief as an output. Treat deal operations as later functionality driven by observed practitioner need. Do not build three unrelated visual themes.

## What the public references actually support

[Hebbia's public Matrix demonstration](https://www.hebbia.com/matrix/) organizes companies, source documents, financial views and analytical work into a structured matrix. The transferable principle is keeping analytical work and evidence in a consistent surface. This is a public product example, not evidence that we inspected its private deployed software or permission to reproduce its design.

[IBM Carbon's data-table guidance](https://carbondesignsystem.com/components/data-table/usage/) provides concrete conventions for table toolbars, search, sorting, expandable detail, row sizes and inline actions. We should use those interaction principles to remove arbitrary controls and inconsistent density. We have not adopted its components or claimed its accessibility certification.

## The next design work should produce these exact artifacts

1. One annotated flagship screen at 1440×900 and 1728×1117. It must show selected evidence, contradictory support, one open diligence issue, the selected scenario and the next decision action using our actual synthetic data.
2. A small component specimen covering navigation, headers, table rows, inputs, status text, source links, dialogs and errors. Define spacing, type scale, column alignment and states once; remove competing CSS rules instead of continually appending overrides.
3. A five-state interaction sequence: baseline evidence → new source delivery → return consequence → named human disposition → reconciled committee memo. Every visible action must work, persist or explain why it cannot proceed.
4. An exception sequence: unavailable source, stale model proposal, conflicting save and unsupported Excel feature. Professional software is judged by these states as much as by its happy path.
5. A comparison review at actual desktop size. Freeze the approved visual standard and use screenshots as acceptance evidence for subsequent changes.

Recommended visual rules: neutral canvas, white work surfaces, graphite navigation, one restrained blue for interaction, semantic color reserved for meaningful financial/review states, 12–14 px table text with tabular numerals, a small heading scale, and consistent 32–36 px controls. Keep source receipts in the inspector or a disclosure. Show ownership and freshness where they affect a decision. Do not invent readiness percentages, dashboards, activity or firm adoption.

The current batch makes the evidence-panel width adjustable and adds compact rows. These are user preferences, not new analytical state. It also replaces repeated financial KPI cards with source-linked comparison rows. This starts the interaction system but does not finish it.

## Exactly how Cooper can help

The highest-value contribution is a compact visual reference packet, not another broad instruction to make it enterprise-grade:

- Three working-product screenshots or official demo timestamps you admire: one dense analytical screen, one source/detail panel and one review/action screen. Prefer public material or material you have permission to share, without client data.
- Annotate three things you like and two you dislike in each. Be specific: row height, typography, navigation placement, amount of white space, source preview, action placement. A screenshot with five arrows is more useful than ten product names.
- Record a short walkthrough of the current Desk: say where you hesitate, what you expected to click and what should happen next. This exposes interaction problems that a static mood board misses.
- Choose the principal audience for the first two minutes: associate/VP doing work or partner reviewing a decision. My default is the associate/VP, with a clean partner handoff at the end.
- Introduce one PE and one VC practitioner willing to attempt the synthetic workflow. We need observed confusion and missing decisions, not a testimonial. No outreach has been sent.
- If accessible without cost, have a product designer critique the single flagship screen. A bounded, annotated review is more useful now than commissioning a large redesign. Hiring is not required for the next pass and no spend is authorized.

We can proceed using the recommendation above without waiting for every input. Cooper's reference packet would substantially reduce aesthetic guesswork. Once provided, the next milestone should be one approved flagship workflow, then consistent application across the rest of the product.

## Brand and skyline

Keep Underwriting Desk as the working product name. “OS” currently overstates breadth. “By Daily AI Agents” can sit in an About panel or career materials rather than every working screen. If desired, a Dallas image belongs on a restrained welcome screen, cover or product story. Use an original or rights-verified asset and record provenance. No skyline asset was copied or added in this batch.

## How to judge the result

A reviewer should find the current investment view quickly, inspect the basis for a number without losing context, understand the consequence of changed evidence, make a named disposition and produce a reconciled memo. No dead actions, false connection status, invented analytics or silent overwrites. Test those tasks with a practitioner before calling the product intuitive or enterprise-ready.
