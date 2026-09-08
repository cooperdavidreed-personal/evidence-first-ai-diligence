UNDERWRITING DESK — LOCAL PREVIEW

1. Extract the entire ZIP into a folder you want to keep.
2. Install Node.js 24 or newer from https://nodejs.org if needed.
3. On Windows, open "Open Underwriting Desk.cmd".
   On macOS, open "Open Underwriting Desk.command".
   If macOS blocks the unsigned launcher or it lacks execute permission, open
   Terminal in this folder and run: node start-desk.mjs
   Do not disable system security protections.
4. Keep the terminal window open. Your browser opens after the Desk is ready.
5. Choose New deal, create a company, then add available materials in Review.
   Confirm financial mappings where relevant and accept the source evidence.
   Select which sources to share, release them, and use Connect model.
   The package does not configure accounts or provide an AI subscription.

Terminal alternative on any supported computer: node start-desk.mjs
If a browser does not open, visit http://127.0.0.1:4198.
Stop with Ctrl+C. Reopen the launcher to resume your saved workspace.
Saved data is in your home folder, under .underwriting-desk/reviews.sqlite.
Deleting this extracted application folder does not delete your saved data.

This is an unsigned local demonstration package, not a signed installer.
Node.js is not bundled. No package manager or dependency install is needed
once Node is installed. Initial cases are synthetic, not investment advice.
No inference service is paid for or operated by this application.
MCP review uses an explicitly published evidence packet. It is not an
unrestricted filesystem connection or an autonomous investment decision.
Static developer MCP tools requiring repository source files are not included;
use the local review-store configuration provided by the Desk.

manifest.json lists the included files and their SHA-256 checksums. These
checksums detect accidental changes; they are not a publisher signature.

BEFORE STARTUP
The launcher checks every manifest-listed file before starting the service.
If a file is missing or changed, extract the original ZIP into a new folder.
Your saved workspace remains in the separate home-folder location above.

Check only (no service, database creation, or browser opening):
  node start-desk.mjs --check
Start without opening the browser automatically:
  node start-desk.mjs --no-open

The manifest itself is not signed. These checks do not authenticate the
publisher or protect against someone replacing both files and manifest.

COMPANY WORKFLOW
Brief maintains adopted findings and diligence. Review handles new evidence
and model proposals. Model shows confirmed operating metrics. Evidence retains
original files. Committee prepares editable screening briefs, management
questions and partner updates. Print / Save PDF uses your browser print dialog.
Financial changes export to a separate XLSX; originals are never overwritten.

Private workspaces use the local SQLite store, not a hosted account. This is
a single-workstation pilot, not multi-user enterprise access control. Device
account permissions and disk encryption protect the live database; the app
does not encrypt that database. Evidence > Local data controls provides
passphrase-encrypted per-company backup, restore and explicit deletion.
Keep the backup passphrase separately. There is no password recovery.
Deletion does not erase exports, backups, model-provider copies, or an older
browser workbook record retained during migration.

SUPPORTED INPUTS AND PILOT BOUNDARIES
XLSX, text-bearing PDF, CSV, TXT and Markdown; 8 MB per source. No OCR or DOCX
import. XLSX review is limited to 10,000 populated cells; PDF to 100 pages.
Only explicit XLSX mappings feed operating comparisons. Excel formulas are
retained with stored results, never recalculated. No arbitrary uploaded model
is automatically a supported PE or VC transaction model.

Claude must expose local MCP to use this package. Organization policies and
managed-device permission may prevent that; this package cannot override them.
The MCP server retrieves only explicitly released source excerpts and related
context, and submits proposals. Workstation saves revoke the prior release.
Choose current proposals as one batch, then release updated context for the
next model pass. Model proposals cannot make human decisions or edit Excel.
