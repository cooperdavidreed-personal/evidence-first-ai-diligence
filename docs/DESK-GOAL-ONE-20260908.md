# Goal 1 — product design completion

Status: COMPLETE for the local Goal 1 implementation and verification scope. Owner: Codex root. Worktree: <repository>; branch codex/desk-local-20260907; inherited HEAD 7722cc0. Existing dirty work preserved. Scope: workbench presentation source, related tests, docs and verification evidence; local build/package only. No publication, paid calls, account changes or financial-engine changes. Activity Mesh synchronization pending; filesystem ownership checkpoint used.

Compare two coded directions using the same entry/review content, choose one on observed legibility and character, implement it across the five desktop destinations, verify loading/empty/focus/error states and desktop sizes, and report limitations. Workbook-first intake belongs to Goal 2.


## Direction and implementation

Compared two coded directions on the same retained AtlasGrid source and model values, at the same desktop dimensions: A, an editorial composition with warm work surfaces and a framed product preview; B, a dark terminal composition with a denser visual character. Selected A for approachability, source reading and consistency with committee workpapers. The concept comparison remains available at `#/design-directions` (open as a fresh page). It is explicitly a visual study and does not update deal state.

The product now opens with a clear introduction and an interactive three-step evidence/economics/committee preview. Its 99.9% to 98.0% retention and 23.3% to 18.4% annualized-return comparison use the retained original AtlasGrid case and documented rerun; the preview is labelled illustrative and does not represent a user's currently edited workspace. The main call to action opens the working case. Go to workspaces collapses the introduction without removing saved work. Add a deal continues into the existing supported-package intake.

Applied shared colors, spacing, radius, elevation and controls across Brief, Review, Model, Evidence and Committee. Kept the existing shared Carbon-informed table behavior. Consolidated the working palette into the workpaper token layer, which also supplies legacy/shared component aliases. Product preview and concept-study styles remain scoped. No design subscription, external font, stock image, copied competitor asset, paid model call or new package dependency was introduced.

Added brief entry/panel motion, reduced-motion behavior, keyboard focus, designed loading and recoverable initial case-load errors. Changed visible labels such as Human disposition to Review decision and Canonical evidence to Approved source; backend state names, calculation bindings and review rules were preserved. Synthetic/public boundaries remain explicit without repeated research-demo labels in the main chrome.

## Verification

- React/Vitest: 229/229 passed.
- Browser suite: 83 passed, 17 intentionally skipped, Chromium and WebKit. Skips include local-store checks that require an explicitly isolated store, mobile-only cases, and duplicate Chromium-owned print/video/admission proof. No failing checks remain in this run.
- New desktop composition checks cover entry and all five destinations at 1280, 1440 and 1728 pixels, with no root horizontal overflow.
- New interaction checks cover the three-step introduction, keyboard entry, empty search/reset, collapsing/restoring the introduction, reduced motion, and loading-error retry.
- Existing workflow checks exercised source inspection, scenario changes, human review, revision acceptance/rejection/deferral, memo reconciliation and export. Native signed-in Claude, ChatGPT and Excel were not rerun for this visual pass.
- TypeScript and Vite production build passed. Chunk checks passed with shell gzip 187070 bytes and initial AtlasGrid transfer 414599 bytes. The checker now explicitly admits the new lazy-loaded concept-study entry while preserving all case-isolation and size checks. Vite's existing oversized uncompressed case-data warning remains.
- Distribution tests: 6/6 passed. The actual new ZIP was extracted and passed integrity preflight for 68 payload files. It is unsigned and requires Node 24 or newer.
- React review covered stable effect dependencies, cached case loading, no new fetching waterfall, isolated preview state, accessible controls, reduced motion, and a recoverable bootstrap failure.

Captured stdout logs and package preflight are in `verification/goal-one-20260908/`. Before screenshots were captured before implementation. After screenshots include settled animations, and the walkthrough records actual browser actions rather than composited frames.

## Review artifacts

- `verification/goal-one-20260908/before/desktop-1440-home.png`
- `verification/goal-one-20260908/after/desktop-1440-home.png`
- `verification/goal-one-20260908/after/desktop-1280-overview.png`
- `verification/goal-one-20260908/after/desktop-A-Entry.png`
- `verification/goal-one-20260908/after/desktop-B-Entry.png`
- `verification/goal-one-20260908/after/desktop-A-Review.png`
- `verification/goal-one-20260908/after/desktop-B-Review.png`
- `verification/goal-one-20260908/goal-one-working-walkthrough.mp4` — silent actual UI walkthrough: introduction, economics preview, Brief, Evidence, exact-source inspection, revised evidence, Committee.
- `dist/local-distribution/underwriting-desk-local.zip`

Current local product: http://127.0.0.1:4198/?goal=one-20260908#/. Public Vercel remains unchanged. Source remains on the existing uncommitted branch with earlier dirty work preserved.

## What this completion does not claim

The ten-second comprehension target and aesthetic preference are design goals assessed here by interface inspection, not an independent practitioner study. Goal 2 remains: workbook-first mapping, partial evidence workspaces, and a stronger public-record demonstration. Intake still requires supported packages today. This visual pass does not establish enterprise security, adoption, investment performance or new native-client verification. The previous source/version/approval mechanics are retained.
