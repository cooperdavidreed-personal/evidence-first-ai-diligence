# Episode 14 — local Version 2 change propagation

State: `VERIFIED`

## Coherent result

An analyst can now upload a complete revised Excel/CSV/PDF package against the approved browser-local Northstar workspace. The Desk:

1. revalidates the manifest and every source digest;
2. reparses the workbook, customer data, and management PDF;
3. rejects cross-company and byte-identical submissions;
4. reruns the deterministic screening calculations;
5. compares retention, revenue, gross margin, gross multiple, and annualized return;
6. opens a critical diligence issue;
7. marks the screening, economics, and diligence memo sections stale; and
8. leaves the approved Version 1 evidence canonical until a named human disposition.

Reject and defer events retain Version 1 without rewriting calculations or evidence. Accept promotes the validated package to Version 2, preserves the stable deal/workspace identity, and archives the complete Version 1 source package and approval record. The Documents view exposes the exact workbook and PDF bytes for both accepted versions.

The included revision fixture lowers the eleven-month opening-cohort retention proxy from 83.6% to 78.6%. Revenue, margin, and return values are still rerun and displayed even when unchanged, preventing the UI from implying that only the visibly changed metric was evaluated.

## Verification

- Unit and component contracts: `122/122 PASS` across 13 files.
- Production TypeScript/Vite build: `PASS`.
- Focused desktop browser journey: `PASS` for Version 1 approval, Version 2 mixed-format validation, impact ranking, explicit reject, defer, and accept events, canonical Version 2 promotion, retained Version 1 source downloads, and refresh persistence.
- Desktop change-control page: no root overflow and no critical or serious Axe finding in the automated snapshot.
- Visual candidate inspected at 1440 by 900; the change comparison is placed before the broader analytical workspace and uses a tabular before/after hierarchy.

## Limits and next state

- The public slice compares the supported Growth SaaS evidence contract; it does not claim arbitrary model ingestion.
- Accepting Version 2 archives source bytes and approvals, but a controlled result-writeback into a designated Excel range and explicit cell-level workbook diff remain to be implemented.
- The current Version 2 revision changes customer evidence only; a separate workbook-value/formula revision fixture remains useful for the Excel re-import proof.
- Claude and Grok remain `HELD_PROVIDER`; no independent provider verdict is claimed.

Proceed to controlled Excel result export/re-import and strengthen memo/evidence lineage around accepted state.
