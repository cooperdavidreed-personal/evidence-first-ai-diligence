# Underwriting Desk — analyst pilot

This is a local, single-workstation candidate. It complements Claude Enterprise and Excel. It is not a deployed enterprise service or a replacement financial model.

## Before the managed workstation test

Obtain permission to run the unsigned local package, Node.js 24 or newer, and a local MCP server in the approved Claude client. Do not bypass application control or organization connector policies. If those are blocked, record the specific restriction; do not substitute an unrestricted remote tunnel or give an agent broad computer permissions.

Extract the complete ZIP into a permanent folder. Run `node start-desk.mjs --check` there. On Windows use `Open Underwriting Desk.cmd`; on macOS use `Open Underwriting Desk.command`, or run `node start-desk.mjs`. Keep its terminal open. The browser should open at http://127.0.0.1:4198. The app does not need a package manager once Node is present. The ZIP does not bundle Node or a publisher signature.

## First company

1. Choose **New deal**. Enter company, strategy, investment question and stage. Create the workspace before all documents are available.
2. Enter your name in **Reviewing as**. In **Review**, add an XLSX, text-bearing PDF, CSV, TXT or Markdown file. Filenames are unrestricted. Confirm XLSX sheet, cell, metric definition, currency, units, period and actual/forecast classification. Accept the evidence with a rationale. Original bytes remain retained.
3. In **Work with Claude or ChatGPT**, select the evidence for this task. Preview it, then **Release selected evidence**. Open **Connection setup** and use the local review-store configuration from this installation. Never use the source-repository fixture server configuration on another computer.
4. In the permitted Claude client, confirm these tools are available: `list_investment_reviews`, `read_investment_evidence`, `propose_investment_work`. Copy the task displayed in Review into Claude. It names this company and release; retrieval follows `nextCursor` until complete.
5. Return to Review and **Collect model work**. Check citations, edit proposed text, and select the proposals to adopt together. The model cannot accept evidence, change financial calculations or record your investment decision. A save revokes the old release, so finish a review batch before requesting the next pass.
6. In **Brief**, review the adopted case. Turn a finding into a diligence question, explaining why the answer matters; assign ownership and the next action. Set decision blockers yourself. Resolve questions with selected evidence and your judgment.
7. In **Committee**, choose Screening brief, Management questions or Partner update. Prepare from the case, edit, then save and reconcile. Download text or use **Print / Save PDF**. Export financial changes to a separate XLSX. Never overwrite the original financial model.

## Second delivery

In Review choose the source being replaced, then add the revised file. Compatible prior financial mappings carry forward as a proposal; inspect them and confirm their definitions. Review changed or missing metrics, then accept, reject or defer the delivery. Accepting preserves the prior source, flags affected findings and outputs, and reopens resolutions tied to the replaced evidence.

For Claude to compare the new delivery to the prior case, explicitly release both the current sources and relevant **prior approved versions**. The model receives their version status. Reconcile changed conclusions against current evidence before exporting an updated deliverable. Historical-only citations cannot silently become a current conclusion.

Reopen the company from Deals after restarting the Desk. Its current case, evidence, questions and outputs should remain together.

## Recovery and boundaries

Evidence → Local data controls provides encrypted company backup, restore and deletion. Use a strong passphrase, keep it separately, and test a backup with synthetic data first. The live SQLite database relies on device account permissions and disk protection; it is not application-encrypted. Backups use authenticated encryption. Revoking MCP stops future reads, not copies already retrieved. Deleting local records does not erase exports, backups, provider copies or a legacy browser review retained during migration.

Limits: 8 MB per file; 10,000 populated XLSX cells; 100 PDF pages; no OCR, DOCX, macro execution, formula recalculation or automatic arbitrary-model support. PE and VC transaction examples remain separate supported engines. Imported operating metrics alone cannot establish valuation, leverage or ownership outcomes. This pilot has no firm-wide identity, roles or simultaneous team collaboration.

## Independent test record

Use a permitted unfamiliar package. Start the timer before setup. Cooper should observe without steering the analyst through each click. Record:

- Installation/connection minutes and every assistance request.
- Mapping corrections and any unsupported materials.
- Duplicate entry or copying between Claude, Excel and the Desk.
- Minutes to the first usable brief and to an updated partner note.
- Whether a second delivery exposes the relevant old conclusions and questions.
- Whether the analyst can explain the current case after reopening it.
- Whether they choose to use it again.

Ask: **What work would you stop doing manually if you kept using this?**

If the answer is unclear, treat workflow value as unproven. A synthetic demonstration is not independent practitioner validation.
