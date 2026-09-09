# Local runbook

Use this branch's build for these checks. The earlier published desktop trial does not include the operating-review increment.

## Build and run

From `workbench`, install pinned dependencies with `pnpm install --frozen-lockfile`, then `pnpm build` and `pnpm desk:start`. Native analyst packages bundle Node. Developers building them need Go and macOS command-line tools: run `node scripts/package-desktop.mjs` after the web build. Artifacts are in the repository's `dist/desktop` directory.

Use New deal → Try monthly operating review. Review the restatement, inspect cash evidence, add the liquidity question to diligence, reconcile the old conclusion and prepare a Partner update in Committee. Future evidence is excluded at the selected cutoff.

## Reproduce checks

From `workbench`:

```sh
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node node_modules/vitest/vitest.mjs run
node --test mcp-server/*.test.mjs
node scripts/evaluate-operating.mjs
node scripts/verify-operating-workflow.mjs
node scripts/verify-desktop.mjs
node scripts/verify-desktop-open.mjs
```

The browser workflow uses a disposable database and port, with Chrome installed. The desktop checks require built packages and a Mac. From `workbench/desktop`, run `go test ./...`. From the repository root, run `python3 scripts/verify_operating_finance.py` and `node infra/aws/verify.mjs`.

## Recovery and upgrade

Export an encrypted company backup before an upgrade and retain its passphrase separately. Use Quit Desk before opening a different app version. The launcher refuses to replace an installation while its owned service is still running; it preserves the prior descriptor and company data. Reopening the same version reuses its live service.

Replacing the app must not delete the user's `.underwriting-desk` data directory. Restore a backup through the existing company restore workflow and verify sources, adopted conclusions and outputs before continuing. A task timing that spans a server restart has unknown elapsed duration.

If a new build fails, quit it and reopen the previous native package. A binary rollback is not a database-schema rollback; preserve a pre-upgrade backup, and do not apply an older incompatible program to a newer database. This increment does not remove existing company records. Store tests cover backup/restore; packaged reopen checks cover persistence. Full disaster recovery on the intended managed workstation remains unrun.

A blocked app or extension requires IT approval, not disabled security or broad computer-control permissions. Windows and Intel packages are cross-built; execution and policy checks on those devices are still required. Actual Claude import, an independent analyst task and cloud deployment remain separate acceptance gates.
