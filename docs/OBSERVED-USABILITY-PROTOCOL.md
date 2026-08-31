# Observed investor-workspace usability protocol

Status: `NOT_RUN`

This protocol tests whether an investment professional can understand and use
the synthetic workspace without coaching. Automated tests, model critiques, and
founder familiarity do not close this gate.

## Participant and setup

- Recruit at least one PE, growth-equity, VC, investment-banking, or transaction-
  advisory practitioner who did not build the product.
- Use the local candidate or an anonymously accessible byte-equivalent build.
- Start on the landing page. Do not explain the navigation, data model, synthetic
  distortions, or intended answer.
- Ask the participant to think aloud. The observer may repeat a task but may not
  point to a control or define a term.
- Record elapsed time, misclicks, requests for help, incorrect conclusions, and a
  1–5 confidence score for every task. Do not record sensitive employer or deal
  information.

## Seven explanation-free tasks

| # | Task | Target | Pass condition |
|---|---|---:|---|
| 1 | Open AtlasGrid and state the recommendation, selected terms, modeled return, and who has authority to approve it. | 90 sec | Identifies `REPRICE`, $210M selected EV, 23.3% / 2.80x, and that human approval is pending. |
| 2 | Explain the three most decision-relevant drivers or risks without opening technical audit details. | 2 min | Gives three case-specific points and distinguishes evidence from judgment. |
| 3 | Change the decisive assumption and explain how the return and hurdle consequence change. | 90 sec | Uses the canonical control and accurately describes the rerun result. |
| 4 | Trace one critical displayed number to its retained synthetic source and explain its business meaning. | 2 min | Opens contextual lineage, identifies the source, and does not treat a hash as the explanation. |
| 5 | Find one unresolved diligence item, its owner, and what happens if it remains unresolved. | 90 sec | Names all three fields correctly. |
| 6 | In Helios, compare naive and adjusted evidence and state the amount of investment credit the workbench permits. | 3 min | Finds Methodology, explains the classification/credit boundary, and avoids claiming real-world causality. |
| 7 | Open or print the one-page memo and summarize the next committee action. | 90 sec | Reaches Memo without coaching and states the gated next action rather than “invest now.” |

## Acceptance rubric

The candidate is ready for a broader public review only if:

- every task is completed without observer navigation help;
- no participant mistakes the analytical recommendation for investment approval;
- no participant mistakes synthetic evidence for private-company or real-market data;
- at least six of seven tasks meet their target time;
- there are no repeated navigation dead ends or hidden critical controls; and
- the participant rates decision clarity at least 4/5 and can name the next action.

Any authority-boundary or synthetic-data misunderstanding is a critical defect
regardless of task time. Capture findings in a dated worksheet and repair them
before changing this document's status.

## Observer worksheet

| Task | Time | Completed unassisted | Misclicks | Help requested | Correct conclusion | Confidence 1–5 | Notes |
|---|---:|---|---:|---|---|---:|---|
| 1 |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |  |

- Participant role (non-identifying): __________
- Candidate SHA: __________
- Viewport/device: __________
- Observer: __________
- Date: __________
- Overall clarity (1–5): __________
- Most confusing moment: __________
- Most valuable view: __________
- Would this support an initial IC discussion? Why or why not: __________
