# Launch recovery and eight-step trial readiness

## Live observation

The installed desktop service responded successfully as 0.3.2-local, with an unfinished setup and no verified Claude connection. Its log was empty. The machine's HTTP/HTTPS handler was Chrome. The application had started; the absence of a visible browser page was not a failed local server. The precise reason the OS browser handoff was not visible remains unconfirmed. A working page was opened in the Codex browser without stopping the user's service or modifying company records.

The Desk's own Open Claude extension button successfully reached Claude Desktop's installation preview for Underwriting Desk 0.3.2, with all requirements met. This bypassed the earlier file-picker difficulty. Installation was left pending at the Install button because computer-use policy requires confirmation for the locally built extension. No provider request or new extension installation is claimed.

## Local improvements

- The launcher writes a readable Open Underwriting Desk.html recovery page in its data folder, containing the running loopback address but no session token. Browser-open errors now explain that the service is running and preserve it instead of killing it.
- Stale proposals can be selected for dismissal. Adoption remains disabled and independently rejects stale work.
- Partner updates lead with the adopted view, compact missing sections, use filenames and cell references instead of internal IDs, put economic interpretation before history, and omit the duplicate financial table when the operating summary is present.
- A new disposable browser test creates a company, uploads an arbitrary-named sparse worksheet in GBP thousands, confirms eight explicit mappings, accepts evidence, checks cash headroom, adopts one seeded proposal and dismisses another after it becomes stale. It verifies unchanged financial source records and renders the actual print output to PDF.

The workbook is a new author-created layout fixture, not an independently supplied practitioner workbook. Its proposals are seeded through the production store; that is UI integration proof, not a native Claude roundtrip. No private firm data or paid inference was used.

## Eight-step status

| Step | State |
|---|---|
| Real Claude connection and proposal | Installation preview reached; final install confirmation and native roundtrip pending |
| Adopt one / dismiss another | Local browser check passed, including stale dismissal and unchanged financial inputs; native model-generated version pending |
| Revised-package workflow | Existing synthetic source-to-diligence-to-committee browser check passed |
| Unfamiliar workbook | Nonstandard synthetic layout passed end to end; independently supplied workbook still needed |
| Partner output / PDF | Reordered and source labels corrected; actual print HTML rendered for local visual inspection |
| Updated package for analyst | 0.3.3 local candidate built; publication and analyst OS confirmation remain pending |
| Independent analyst trial | Requires the analyst; no completion, savings or adoption claim |
| Fix trial findings / demonstration | Local friction fixed; practitioner-driven prioritization and final demonstration follow the trial |

## Next action

Approve the pending local Claude extension installation, then run its fresh verification code and a synthetic review on the same released company. Keep the installed 0.3.2 and the new 0.3.3 candidate distinct until the upgrade is exercised. Do not replace the public download or send a revised link without release approval. If managed policy blocks the app, obtain the firm's approval rather than disabling protections.

Verification: TypeScript/build passed. The 245-test UI suite and 36 server tests passed during the episode; after the final export wording change, the six output/data unit tests and full unfamiliar-workbook browser/export check passed again. The final 0.3.3 Mac package passed extraction, authenticated matching extension download, connection harness, recovery-address file and reopen/persistence tests. Both PDF pages were visually inspected. [Retained results](launch-readiness-verification.json), [editable synthetic output](unfamiliar-partner-update.txt). Public source scan passed.
