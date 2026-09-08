# Runtime and portable-package verification — September 7, 2026

Executed in `evidence-first-ai-diligence-desk-local-20260907/workbench` against the accumulated implementation worktree.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm test:mcp` | PASS — 19/19 | Built-file HTTP boundary, loopback/origin checks, source archive durability/integrity, MCP read/propose-only tools, stale packet rejection, local workspace history and conflicting revisions. |
| `pnpm test:package` | PASS — 6/6 | Allowlisted ZIP, hashes, extraction, standalone runtime, manifest check without DB creation, changed/missing file rejection, startup/termination, invalid/occupied ports. |

The package subprocess tests exercise extracted Node entrypoints on this host. They do not exercise double-click execution in macOS Finder or Windows Explorer, install Node, change AI-client settings, or establish an actual AI-client roundtrip.

## Committee snapshot review

The snapshot function rejects an empty memo, a missing scenario binding, any section whose binding differs from the selected scenario, and an explicit reconciliation blocker. JSON export checks the helper again when clicked. HTML and print/PDF controls use the same readiness gate.

The result is detached from mutable workspace objects, recursively frozen in memory, and contains a SHA-256 checksum of the serialized contents. It records the supplied workspace revision, scenario binding, memo, diligence, assumptions, policy reviews, and package-change control. Private notes and observations are excluded. It explicitly leaves committee judgment `IC_DECISION_PENDING`.

This is a review record, not a signed approval. Its scenario binding relies on the application's validated scenario summary; this export function does not independently recalculate the financial model or authenticate the named human. A checksum cannot establish publisher identity or prevent someone replacing both contents and checksum.

## Distribution status

The ZIP was refreshed after the parent writer confirmed the final application build.

- Path: `dist/local-distribution/underwriting-desk-local.zip`
- SHA-256: `7d353466d51b199c943814f95ce156372f24e5193f92027c584bb609844637d2`
- Size: 3,875,558 bytes
- Archive entries: 64 (63 manifest-listed files plus the manifest)
- Actual final archive extraction and `node start-desk.mjs --check`: PASS, exit 0, 63 file hashes verified, no database created. Temporary extracted files were removed after verification.

Packaging logic was unchanged since the 6/6 package test run. Repository docs, including the separately updated client-readiness report, are not copied into this runtime archive; its launcher README is included. This report covers runtime/package proof only; the parent writer owns final unit, browser, accessibility, build, and visual evidence. No push or deployment was performed.
