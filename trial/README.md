# Underwriting Desk — workstation trial

**Download:** [Underwriting Desk ZIP](https://github.com/cooperdavidreed-personal/evidence-first-ai-diligence/raw/refs/heads/codex/desk-local-20260907/trial/underwriting-desk-local.zip).

Extract the entire ZIP. You need Node.js 24 or newer and permission to run the application on this computer. Open `Open Underwriting Desk.cmd` on Windows or `Open Underwriting Desk.command` on macOS. Alternatively, open a terminal in the extracted folder and run `node start-desk.mjs`. Keep that terminal open.

This is an unsigned local pilot. The live website is a separate public demonstration and does not contain your saved company workspace. Installation and local MCP must be permitted by your organization. Claude Enterprise access alone does not establish that permission. No API key or Desk-operated inference service is required.

1. In the Desk choose **New deal** and create the company.
2. In **Review**, add available materials. Confirm financial mappings if using an XLSX, then accept evidence.
3. Select sources to release, open **Connect model**, choose Claude Desktop, and use the detected configuration fragment. Preserve existing connections. Follow the displayed setup instructions; local configuration requires restarting Claude Desktop.
4. Copy the task displayed in Review into Claude. Ask it to read all pages of released evidence and propose the first investment review.
5. Collect model work, inspect citations, edit and adopt the proposals you want. Turn a concern into an assigned diligence question.
6. Add a revised delivery. Select prior approved sources too when asking Claude to compare the new delivery with the previous case. Review the affected conclusions and questions.
7. Prepare a partner update in Committee, reconcile it, and download editable text or save PDF from the print dialog.
8. Close and reopen the Desk. Verify you can immediately understand the company’s current state.

Optional: use the two clearly synthetic notes in [fixtures](fixtures/) for a connection smoke test before using a permitted real package. Add the second as a replacement for the first. Synthetic success does not validate investment usefulness.

See the [complete pilot protocol](../docs/DESK-ANALYST-PILOT-20260909.md). Record results in [trial-feedback.csv](trial-feedback.csv). The key question: **What work would you stop doing manually if you kept using this?**

Keep company backups and passphrases private. The ZIP contains application code and synthetic examples, never an analyst’s database or credentials. Local data controls explain backup, deletion and model-sharing boundaries. Missing features include OCR, DOCX, arbitrary Excel formula recalculation and multi-user collaboration.
