# Underwriting Desk: implementation lane and design direction

## Scope and authority

Cooper approved starting implementation on September 7, 2026. Owner: this Codex task. Worktree: `<repository>`; branch: `codex/desk-local-20260907`; starting commit: `7722cc0e54641f744569829c34c7d280274773ae`. The released main and the Claude design candidate are preserved. No merge, push, deployment, paid inference, account changes, or external communications are authorized. No live Company Brain/Activity Mesh registration was performed.

## Product and design decision

Underwriting Desk is an investment-case review workspace. Its value must appear when new evidence changes an underwriting argument: inspect the change, understand the economic consequence, challenge the interpretation with a model, and approve a revised case. An attractive dashboard or an additional chat window does not establish that value.

The existing React/CSS implementation is the starting point. Replacing it with Tailwind would change the styling mechanism, not establish a visual direction. Do not copy a competitor's source, assets, branding, or complete layout. Claude design review is useful when subscription authentication is restored; it is not a prerequisite for implementation and was not obtained in this pass.

Use warm near-white working surfaces, graphite text, restrained navigation, muted navy interactive emphasis, 4–6px corner radii, aligned tabular figures, and roughly 14px body text. Prefer bordered rows and adjacent inspectors to floating cards. Show units, periods, source dates, and comparison baselines. Preserve position when opening evidence. Place receipts and machine diagnostics behind disclosure.

The first screen to perfect is a review queue with the selected change beside it: prior evidence, revised evidence, economic implication, and accept/reject/defer controls. Investment Case, Changes, Financial Model, Diligence, and Sources are the eventual main areas; Committee is an action. This first slice adds a functional evidence handoff inside the existing Model review area; it does not claim the navigation redesign is finished.

## References and how to use them

- [Linear Triage](https://linear.app/docs/triage) and [Peek](https://linear.app/docs/peek): maintain queue position while inspecting and disposing of work. Adapt the interaction principle, not its exact layout.
- [Quartr slide history](https://quartr.com/features/slide-history-comparison) and [transcript highlighting](https://quartr.com/features/transcript-highlighting): put historical source comparison beside the selected claim and reopen the precise supporting passage.
- [Hebbia's Matrix introduction and official video](https://www.hebbia.com/blog/introducing-matrix-the-interface-to-agi): make analytical questions, answers, and supporting material separately inspectable. This 2024 demonstration is not evidence of every current product screen.
- [Excel Show Changes](https://support.microsoft.com/en-us/excel/get-help-with-show-changes-in-excel): preserve cell context and distinguish values from formulas. The Desk must add investment consequences and approved case versions; ordinary change inspection already exists.

These are documented interfaces and vendor demonstrations, not hands-on evaluations of paid accounts. A sales-booking page is not product interaction evidence. Prefer a short official walkthrough to an influencer's generalized aesthetic advice.

## Dallas identity

[Dallas skyline from Reunion Tower, September 2025](https://commons.wikimedia.org/wiki/File:Dallas_Texas_skyline_from_Reunion_Tower_September_2025.png) is declared as own work by IcedCowboyCoffee, dated September 14, 2025, under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The file page's provenance was checked; composition has not been visually evaluated and no asset was downloaded or installed. If adopted, record the source and rights in the asset register. Use it only for the entry point, demo cover, or career material. Omit it from analysis screens. Keep “Underwriting Desk” as the product name with a quiet Daily AI Agents endorsement; avoid “OS.”

## How Cooper can steer the aesthetic

No additional input is required to proceed. The most useful input would be three working-screen references, each annotated with the specific quality to retain or avoid: hierarchy, density, navigation, source inspection, or decision controls. A short video of a task transition is more informative than ten landing-page screenshots. Review a real populated workflow at 1440×900 rather than choosing between generic visual themes.

## First implementation slice

The local review bridge uses a SQLite store containing only explicitly prepared selected-evidence packets and returned model envelopes. The browser still owns the existing deal workspace. This is **not** a completed canonical-deal-store migration, team system, or automatic live workbook connection.

The MCP process opens the same store and exposes exactly three tools in this mode: list prepared reviews, get selected review context, and submit proposals. It has no approval tool. A content digest binds the response to the prepared evidence; preparing changed evidence clears the old response, and a compare-and-set rejects late responses. The Desk validates proposal citations and content with its existing validator, requires named human review, and preserves the outcome through existing workspace persistence. The model's identity remains self-reported.

The bridge is opt-in, development-only, and served on loopback by Vite. It checks Host, Origin when present, and a custom request header without permitting CORS. These controls reduce browser cross-origin access; they are not user authentication or protection from software running as the same OS user. The database file is mode 0600. Use synthetic data in this reference implementation. There is no API-funded inference or newly provisioned hosted infrastructure.

### Run locally

Requires Node 24 or later with `node:sqlite`, pnpm, and the existing installed model subscription/client. From this worktree's `workbench` directory:

```sh
DESK_LOCAL_STORE="$HOME/.underwriting-desk/reviews.sqlite" pnpm dev --host 127.0.0.1 --port 4197
```

Configure an MCP client to launch the following command with the same absolute database path (expand your home directory in client configuration):

```sh
node <repository>/workbench/mcp-server/server.mjs --review-store <user-home>/.underwriting-desk/reviews.sqlite
```

Open a deal → Diligence → Model review. Select evidence, prepare it, ask the connected client to read and submit a review, collect the response, and accept or reject it. Neither starting the local app nor saving setup instructions establishes a live provider connection. This pass does not configure accounts. Existing `--proposal-ledger` static-case mode remains available independently; do not confuse its case data with a prepared evidence review. Local stdio configuration is client-specific and does not automatically create a ChatGPT web or Excel connector.

## Next increments, in priority order

1. Finish local onboarding and package the loopback service outside Vite. Show an actual connectivity test. Remove the paid-adapter-first setup path from the primary user journey.
2. Move approved workspace revisions into a transactional local canonical store with conflict detection and migration/recovery proof; include current scenario interpretation in the review contract. An evidence digest alone is not a complete investment-case version.
3. Build the Changes work surface using existing intake, lineage, and financial consequences. Implement supported Excel semantic comparisons and a controlled review-sheet roundtrip. Preserve original formula bytes on export, and separately test a real Excel save cycle.
4. Refine the complete desktop shell around that proven workflow, then demonstrate PE and VC versions with defensible distinct transaction mechanics. Do not expand to CRM, proprietary sourcing databases, or a generic agent platform.

Measure these increments by demonstrated workflows rather than treating the previous 25–40 day estimate as a fixed schedule. Reuse existing code wherever it passes the workflow test. The full aesthetic overhaul, native-client roundtrip, and Excel save-cycle validation remain unfinished.

## Visual acceptance criteria

At 1440×900 and 1728×1117, a new viewer should locate the company, current view, outstanding review, and next action within ten seconds. A material change should open its exact source in one interaction. Eight useful queue rows should fit while preserving selected-item context. Every number needs units and a period. Decisions must have visible, persistent consequences. Verify populated, empty, stale, rejected, failed, and completed states, keyboard focus, and source-return navigation. These are targets until observed with practitioners, not usability claims.

Career claims remain limited to implemented and tested behavior. Do not claim enterprise security, firm adoption, investment results, or practitioner validation. The strongest demonstration is a revised workbook changing a reviewed investment argument with inspectable sources and human control.

## Verification of this slice

- TypeScript and Vite production build: PASS; existing large case-chunk warning remains.
- Existing Vitest suite: 135/135 PASS. Additional stale-evidence acceptance test: 1/1 PASS.
- MCP tests: 11/11 PASS, including cross-connection SQLite visibility, snapshot replacement, late-response rejection, restricted tool surface, and existing static MCP tests.
- Desktop Chromium: 1/1 targeted end-to-end PASS. Real browser selection → separate stdio MCP process → synthetic response → named human acceptance → reload persistence. Missing local request header returns HTTP 403. This test did not call a model provider.
- Screenshots inspected at 1440 and 1728 widths; artifacts in this lane's ignored `dist/local-review-1440.png` and `dist/local-review-1728.png`. The duplicated hosted controls found in the first screenshot were removed from local mode and the browser test was rerun.
- Chunk-budget verification and `git diff --check`: PASS.
- Python, WebKit, full desktop regression suite, native Claude/ChatGPT subscription roundtrip, and actual Excel application save cycle: NOT RUN in this slice.
- Changes remain local and uncommitted. Released product and preserved Claude candidate were not changed.
