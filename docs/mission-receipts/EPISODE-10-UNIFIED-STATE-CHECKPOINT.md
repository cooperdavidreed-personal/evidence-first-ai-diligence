# Episode 10 — unified release state checkpoint

- Recorded: `2026-09-01`
- Mission: `underwriting-unified-career-product-20260901`
- Mission digest: `358d8d207a343ae2ba86839103cd03ae09cb40b6ecab928dc324c7782b4b4995`
- Exact checkpoint head: `a05ce6592a0acc102211ffe9472814c5b44d2a41`
- Branch: `codex/underwriting-product-vertical-slice`
- Remote default branch: `main` at `5795f00fe7466991605dfba95b7d0d3b90cde5bd`
- Divergence: branch `28` ahead, `0` behind remote main
- Worktree before checkpoint documentation: clean
- Product files changed before checkpoint: `0`

## Public state

- GitHub Pages: stale `Underwriting Intelligence Lab` from remote main; workflow run `33473886222` passed.
- Vercel: `https://underwriting-desk-delta.vercel.app/`, direct static deployment `dpl_4uE7h1pEe5XBXKh11QqNNFpS5ERw`, not Git-backed.
- Current branch CI: run `33541276566`, all nine jobs passed.
- Repository description and homepage: still describe and link the old Lab/Pages release.
- Public split: confirmed.

## Preserved artifacts

- Retained case payload SHA-256: `d3093e468b6aee69871dca8cb79e9dd869cbf8441555ac3d7166bf5863b6c95b`.
- ElevenLabs demonstration SHA-256: `fd3b692b9b5eccb0ae353eda0c9a7d3b5c8e80b4756b46fc4ee7900bdc06d38c`; 86 seconds; retained but stale for the final Desk.
- Six PDF SHA-256 values remain those bound by `demo/release-fix/manifest.json`.
- Prior richer mechanics remain recoverable from default-branch commit `5795f00` and release-fix commit `528cc9b` without changing the retained case payload.

## Verified defects

- Northstar package-authored thresholds drive its own readiness state. Its arithmetic independently reproduces, but `83.6%` NRR is not a gate and the tests require the incorrect `READY FOR IC REVIEW` outcome.
- The current retained-case workflow is primarily read-only: no bounded scenario edit, deterministic rerun, human notes, issue lifecycle, source excerpt preview, memo editing, persisted workspace, or portable deal-state import/export.
- The public hosted model path is unavailable; the governed local proposal boundary is real but not an unguided hosted demonstration.
- Browser Back can change the hash without updating the rendered view.
- Scrolled Deals-to-deal navigation retains nonzero mobile scroll.
- Raw ISO time, `Pending founder signature`, repeated provenance labels, sparse one-column composition, and filename-only Documents are visible.

## Boundaries

- Gmail message-read scope was not independently verified; no mailbox-content claim is made. The active directive and retained local package are used as the authoritative review input.
- Vercel CLI has no local credentials. Read-only public evidence and the prior authenticated deployment receipt establish current deployment state; Git integration remains an acceptance-gated external configuration step.
- Practitioner results remain `NOT RUN`; no simulated participant result is accepted.

## Frozen contract

The controlling implementation contract is `docs/UNIFIED-CAREER-PRODUCT-CONTRACT.md`.

Terminal state: `CHECKPOINT_VERIFIED_CONTRACT_FROZEN`
