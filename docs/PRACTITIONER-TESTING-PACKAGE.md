# Underwriting Desk unguided practitioner test

Status: `READY TO RUN — RESULTS NOT YET COLLECTED`

This protocol evaluates whether the public synthetic product is understandable and useful without a guided demonstration. It does not ask participants to validate an investment recommendation, real-company accuracy, enterprise security, or confidential-data readiness.

Give participants the concise [20-minute test card](PRACTITIONER-TEST-CARD.md). Keep this document as the moderator and scoring guide.

## Participants

Run the same core protocol with four perspectives:

1. Senior venture or growth investor — tests financing logic, cohort risk, milestones, and IC usefulness.
2. Buyout or growth-equity practitioner — tests evidence quality, downside framing, sensitivity work, and decision discipline.
3. Former software CFO or CEO — tests operating credibility, financial definitions, management questions, and value-creation practicality.
4. Skeptical recruiter or hiring manager — tests self-explanation, differentiation, polish, and what Cooper demonstrably contributed.

Record role and relevant experience, but do not collect confidential employer, fund, portfolio-company, or deal information.

## Moderator setup

- Share only the canonical public URL and this task list. Do not explain the interface first.
- Ask the participant to think aloud and share their screen if comfortable.
- State that every company and record is fictional and that no confidential information should be uploaded.
- Start a timer when the participant opens the URL. Stop after 20 minutes.
- Do not rescue the participant unless they have been blocked for 90 seconds; record every intervention.
- Give the participant the four exact Northstar files: [`manifest.json`](https://underwriting-desk-delta.vercel.app/sample-package/manifest.json), [`deal.json`](https://underwriting-desk-delta.vercel.app/sample-package/deal.json), [`monthly_financials.csv`](https://underwriting-desk-delta.vercel.app/sample-package/monthly_financials.csv), and [`customer_arr.csv`](https://underwriting-desk-delta.vercel.app/sample-package/customer_arr.csv). The manifest SHA-256 is `00a75b14db10df21adc17ca3b9c89dedf848e1a099b5d831b6b68510e5436227`.

## Core tasks

1. In no more than two minutes, explain what the product does, the current posture of one retained deal, and its main risk.
2. Open **New deal** and import the four files from the public Northstar sample package. Identify recognized and missing inputs.
3. Explain why the 83.6% 11-month cohort-retention proxy matters against the separate annual-NRR screen even though the illustrative return screen clears.
4. Change one authorized scenario input and describe how the financial outputs and decision consequence change. Return to the canonical case and confirm it was not overwritten.
5. Trace one important number to its exact source excerpt, row, period, or selected field.
6. Add a named investment observation or meeting note.
7. Create a diligence issue, assign an owner and due date, change its priority and status, and record a named resolution. Enter your own name or initials whenever the product asks for a named human.
8. Review one material assumption and either approve or reject it with a rationale. Explain why that action does not rewrite the source facts or fund policy.
9. Select an exact evidence subset, request a model challenge, and review the resulting `PROPOSED` item. Accept, reject, or edit it through a named human action.
10. State the resulting analytical posture, edit and export the IC working memo, and verify that the selected scenario and unresolved conditions appear in the export. Export the portable deal state, refresh, and confirm that the browser-local workspace persists or can be restored. Do not treat the provisional posture as a final IC authorization.
11. Explain, in your own words, why this differs from performing the entire underwriting process inside Claude or ChatGPT.

## Role-specific substitution

To keep the exercise within 20 minutes, replace core task 3 with one role-specific task; do not add all four.

- **Senior VC or growth investor:** In Helios, trace ownership and dilution through the financing terms, identify the runway or preference assumption that matters most, and state one milestone or falsifier that would change the investment posture.
- **Buyout or growth-equity practitioner:** In AtlasGrid, inspect normalized EBITDA and challenged add-backs, test either entry price or exit multiple, and explain the resulting leverage, covenant, or return consequence.
- **Former software CFO or CEO:** Reconcile one revenue or gross-margin output and one cash, runway, or operating KPI to source evidence, then convert the operating concern into a diligence issue or value-creation action with an owner and KPI.
- **Recruiter or hiring manager:** Find the public provenance and limitations, distinguish Cooper's evidenced contribution from model assistance, and identify one résumé claim the artifacts support and one they do not support.

Every role must complete the integrity-critical tasks—source tracing, scenario change, named human judgment, model-proposal disposition, and export—plus its role-specific substitution.

## Scoring anchors

- **Primary risk:** pass only if the participant names the decision-changing risk and connects it to the current posture.
- **Fact/assumption/policy separation:** pass only if the participant can identify one item in each class and states that the uploaded company package cannot set fund policy.
- **Model differentiation:** pass only if the explanation includes canonical deal state, deterministic finance, selected evidence references, proposal-only model authority, and named human disposition.
- **Export verification:** pass only if the downloaded memo and portable state are opened or otherwise verified, not merely clicked.

## Evidence capture

For every task, record:

| Field | Allowed values |
|---|---|
| Completion | completed / completed with help / failed |
| Time | seconds |
| Confidence | 1–5 |
| Confusion | verbatim observation |
| Error | exact visible behavior |
| Trust objection | verbatim concern |
| Missing workflow | participant description |
| Intervention | none or moderator action |
| Time expired | yes / no |
| Export evidence | artifact name and verified / not verified |

After the tasks, ask:

- Would you use this in an actual underwriting workflow? Why or why not?
- What would need to change before you would trust it with a real deal?
- What is the clearest advantage over a general-purpose frontier-model workspace?
- What feels decorative, unnecessary, or insufficiently credible?
- What do you believe Cooper personally designed, implemented, or validated?
- Would this project strengthen Cooper's candidacy for an investing, strategy, finance, or applied-AI role? Why?

## Decision rules

The product is not practitioner-ready merely because a participant likes it. A test round is a pass only when:

- at least three of four participants complete tasks 1–10 without moderator rescue, and no participant fails an integrity-critical or role-specific task;
- every participant can identify the primary risk and explain the source/assumption/policy separation;
- every participant successfully traces a number, changes a scenario, contributes human judgment, and processes a model proposal;
- no participant believes the model silently changed finance, policy, assumptions, recommendation, or approval;
- no critical integrity, security, or misleading-claim issue appears;
- the median participant can explain the difference from using a general chatbot alone.

Any critical trust or calculation issue stops career promotion until repaired and retested. Usability friction, objections, and failed tasks must be reported; do not replace observed results with simulated or model-generated feedback.

## Results sheet

Create one row per participant and task, then summarize:

- completion rate and median time by task;
- interventions and failure points;
- recurring confusion and trust objections;
- requested workflow additions;
- willingness to use;
- perceived differentiation;
- perceived Cooper contribution;
- accepted repairs, deferred requests, and retest outcome.

Current observed result: `NOT RUN`.
