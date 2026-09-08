# Underwriting change review — implementation checkpoint

Owner: Codex root. Worktree: `<repository>`; branch `codex/desk-local-20260907`; starting HEAD `7722cc0e54641f744569829c34c7d280274773ae`. Existing dirty work preserved. Cooper authorized the twelve-step audit plan on September 8.

Scope: reversible local source, tests, design, documentation and local distribution. No publish, push, merge, external account changes or paid model calls. Practitioner testing requires actual practitioners; prepare a protocol rather than invent results.

Filesystem ownership checkpoint; Activity Mesh synchronization is pending (no authorized live attachment interface invoked). Required-core health is not inferred from this source work.

Disjoint implementation owners:
- root: App, local-deal, analysis-workspace, navigation, visual system, source selection, integration, test adaptations and docs.
- audit_workflow: review-basis, financial-workspace, scenario/committee snapshot tests.
- source_archive: supported-revision, local-change-control, excel-round-trip and corresponding new tests.
- launch_bundle: workspace-ui, workspace-ui-review tests, committee-review styles.

Completion gates: shared evidence/scenario projection; unsupported results closed; compact Brief/Review; five destinations; consistent tables; unseen supported revisions; controlled Excel admission; evidence-backed diligence; contextual/stale model proposals; coherent committee output; local verification and feedback kit. Status: COMPLETE for the authorized local implementation and delivery scope. Practitioner validation, refreshed final film and production enterprise readiness remain outside this completion claim.


## Twelve-step delivery ledger

| Step | Delivered | Acceptance evidence |
|---|---|---|
| 1. Preserve the baseline | Exact owned worktree retained, earlier source changes preserved, local-only scope recorded | This checkpoint; public release unchanged |
| 2. One review basis | Shared source/scenario/disposition projection across headline economics, financial results and committee reconciliation | Review-basis and scenario tests |
| 3. Block unsupported combinations | Revised PE results cannot borrow baseline schedules or unverified scenario outputs; unsupported reconciliation is blocked | Review-basis and browser revision tests |
| 4. Investment-first Brief | Current view, economics, supporting/opposing argument, source drivers, conditions and next committee action | Desktop investor-journey screenshots and tests |
| 5. Five destinations | Brief, Review, Model, Evidence, Committee; consolidated deal register; selected evidence/issues use navigable URLs | App, navigation and browser journey tests |
| 6. Consistent workpapers and tables | Restrained desktop shell, compact headings, sortable tables, row selection and adjacent source inspector; technical detail disclosed on demand | Chromium/WebKit screenshots and table/accessibility checks |
| 7. Supported source revisions | Actual file and calculated-measure changes, unchanged-delivery rejection, dependencies and retained source history | Supported-revision tests and two-browser unseen-input workflow |
| 8. Excel revision admission | Supported numeric input edits prepare a new package; formula/structure edits cannot bypass admission; human reject/defer/accept controls | Same workbook bytes rejected, reconsidered, accepted and reopened with preserved history |
| 9. Evidence-backed diligence | Evidence selection when creating issues, source links and explicit resolution-evidence notes | Workspace UI tests; issue navigation |
| 10. Contextual model work | Current review basis binds requests and proposals; stale or legacy unbound proposals remain visible but cannot enter the current memo | MCP store, local-review and legacy-ledger tests |
| 11. Committee output | Preview first, explicit editing, current-basis reconciliation, stale-section protection, source-backed accepted proposals | Memo/browser/PDF tests |
| 12. Review-ready local delivery | Production build, local launcher ZIP, integrity check, screenshots, feedback route and defensible career narrative | Verification below; Cooper/practitioner feedback remains external work |

## Product boundary

The niche is underwriting change review: explain how a new source delivery changes an investment case and prepare a consistent committee update. This complements Excel and subscription AI assistants. It does not replace sourcing databases, firm CRM, arbitrary financial modeling or an institutional document-management platform.

General package admission remains format-bounded. Excel preparation supports recognized numeric literal inputs; it is not arbitrary formula execution. Guided AtlasGrid revised PE economics use a retained deterministic rerun, not a general-purpose PE solver for new uploads. Named reviewers are local attribution, not authenticated institutional identities. Diligence resolution evidence is retained explicitly in the resolution record; it is not a new firm-wide document graph.

## Verification and delivery

- 229/229 React/Vitest tests passed across 36 files.
- 20/20 MCP/store tests passed.
- TypeScript and Vite production build passed.
- Chunk budget check passed; Vite still reports oversized uncompressed case-data chunks. This is known performance debt, not a test failure or a claim of optimized performance.
- 6/6 distribution tests passed, including extracted-launcher start/save/termination and integrity failure handling.
- Actual generated ZIP extracted and `node start-desk.mjs --check` passed: 63 payload files verified. The ZIP is unsigned and requires Node 24 or newer; it does not bundle Node.
- 78 distinct browser checks passed across the full suite and focused reruns: 72 passed in the full run, the two failing revision checks passed after the duplicate-staging fix, and four local-store checks passed with isolated browser stores. Twelve additional project-specific cases remain intentionally skipped (mobile-only or duplicated Chromium-owned proof). This is an aggregate of recorded runs, not a claim that the pre-fix full-suite log was all green.

Current preview: http://127.0.0.1:4198/?review=20260908-final#/. The owned local server was restarted against this worktree's production build, preserving `<user-home>/.underwriting-desk/reviews.sqlite`. Automated revision tests used isolated stores. No public deployment, push or merge occurred.

Distribution: `dist/local-distribution/underwriting-desk-local.zip` and sibling SHA-256 file. A checksum verifies bytes, not publisher identity or security certification.

Review screenshots: `verification/desk-twelve-20260908/`. Existing screenshot and accessibility suites also write their established verification directories.

## What remains

1. Cooper's unrehearsed desktop feedback video using `DESK-FEEDBACK-VIDEO-20260908.md`; then fix the highest-impact navigation or hierarchy findings.
2. Independent PE/VC practitioner tasks and comparison with their existing workflow: NOT RUN. Protocol supplied; no adoption or time-saving claims.
3. A final demonstration film after feedback. The old film remains historical evidence of an earlier UI.
4. Native Claude/ChatGPT/Excel observations are inherited prior evidence, not rerun in this increment. Current proof covers browser, local MCP protocol and supported workbook files, not another signed-in native-client session.
5. Python suite NOT RUN; no Python implementation changed. Phone layouts were not prioritized. Browser accessibility checks are bounded, not comprehensive WCAG certification.
6. Enterprise deployment would require a separate identity/access, multi-user authorization, data protection, backup/recovery and operational-security program. This deliverable is a professional local research demonstration, not certified enterprise infrastructure.

Source is intentionally uncommitted on the existing local branch. No external account changes or paid model calls were made. Activity Mesh synchronization remains pending; this file is the filesystem handoff checkpoint.


### Reproducing local-store browser checks

Run `tests/local-review.spec.ts` and `tests/package-archive.spec.ts` separately for each browser project, each with a new task-owned `DESK_LOCAL_STORE` path and free `WORKBENCH_PORT`. Use `PLAYWRIGHT_PROJECTS=desktop` or `desktop-webkit`. Never point verification at the user's saved store. Reusing a database across projects legitimately restores the previous project's human decision; that is not a clean review fixture.

Verification encountered and resolved obsolete UI-copy expectations and a legacy-ledger test that previously expected an unbound proposal to be accepted. The latter now asserts the intended rejection boundary. A first local-store WebKit run reused Chromium's accepted state; the isolated rerun passed. Product validation was not relaxed to satisfy these tests.


Final verification also caught a real asynchronous parent/child handoff race: a manually staged revision echoed through parent state and started a second validation, which could overwrite a later deferral notice. The stage marker now prevents the echo; failed validation clears it for retry. Two new unit tests and both actual local V2 browser flows pass after the fix. Final source build and ZIP include this repair.

Final ZIP SHA-256: `756637ceb36111ebd98c655a54c2fb7d3050db5038dcf9e125207e1e5149950e`. Test/build/package receipts are retained under `verification/desk-twelve-20260908/`; historical failing logs are explicitly named and are not presented as clean passes.
