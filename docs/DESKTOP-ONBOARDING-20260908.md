# Desktop onboarding candidate — September 8, 2026

Owner: current Codex desktop task. Exact scope: evidence-first-ai-diligence-desk-local-20260907, branch codex/desk-local-20260907. Company synchronization pending; this filesystem checkpoint is the handoff.

## Delivered

- Self-extracting Windows x64 executable and Apple Silicon / Intel Mac application ZIPs. Official Node 24.20.0 runtime included and verified against its published SHA-256 checksums at build time. No end-user Node, Git, terminal, Linux, API key or dependency download.
- Small Go launcher, versioned per-user payload, integrity checks, safe extraction, preserved canonical database, and graphical startup errors. The launcher opens the browser and exits; the local service persists until the authenticated Quit Desk action. Opening again reuses an owned live service.
- Claude MCPB extension with Windows and universal Mac connector binaries. It discovers the installed Desk and uses its bundled runtime; no configuration editing or unrestricted filesystem connector. Anthropic MCPB manifest validation passed.
- Desktop-only onboarding wizard, extension launch, optional skip, copyable connection test, and persistent completion. A random ten-minute single-use code crosses the real MCP boundary before verification appears. This is proof of a tool exchange, not authentication of the self-reported client identity.
- Setup can be reopened without unmounting the active workspace or losing unsaved local UI state. Existing Connect model button opens the desktop wizard. Legacy web/local setup remains available outside this application.
- Existing deal database, evidence scope, proposal-only model permissions, deterministic mechanics, financial workflows and backup controls retained. No source or investment decisions are changed during the connection test.

## Verification

- 242 React/Vitest tests passed; 28 Node server/MCP tests passed; 6 legacy packaging tests passed.
- Three Go installation tests passed: traversal rejection, integrity/data preservation, symlink rejection. Native and Windows-target Go vet passed.
- TypeScript and production build passed. Existing large synthetic-case chunk warning remains.
- Actual extracted Apple Silicon package, path with spaces, no Node on PATH, bundled Node 24.20.0, browser wizard, extracted MCPB binary roundtrip, fresh challenge confirmation, workspace opening, company record and onboarding persistence after quit/reopen, and second-open reuse passed with disposable synthetic data.
- macOS Launch Services opened the .app and its authenticated local service without a developer runtime on PATH. Automatic default-browser opening was not independently asserted in this Launch Services check.
- Public source scan passed for 745 candidate files.
- Screenshots inspected: dist/desktop/onboarding-verified.png and workspace-open.png.
- No Python implementation changed; prior full Python suite was not repeated for this packaging change.

## Boundaries and next action

Windows and Intel Mac native execution, actual Claude Desktop extension import, managed-workstation installation, downloaded-file quarantine, and independent analyst trial remain NOT RUN. Mac binaries have a local ad-hoc signature only, not a trusted Developer ID certificate or notarization; Windows is unsigned. Organizational policy cannot be bypassed. No money, inference service, account changes, merge or deployment.

Native downloads remain local in dist/desktop, outside Git, to avoid committing roughly 145 MB of generated executables. The previous trial ZIP on GitHub is still the older runtime-required distribution. Send the appropriate native package and trial/DESKTOP-START.md after confirming the target operating system and installation permission. Quit the running Desk before replacing it with a newer version. Old application payloads are retained; no automated deletion or update service is installed.

## Build and developer checks

On the Mac build workstation: `pnpm --dir workbench desk:desktop`. Requires Go, Xcode command-line utilities, Node and pnpm for the developer build only. Build-time Node downloads use the official Node release host; there are no runtime downloads. Dependency license notices ship in each application.

From workbench: `node scripts/verify-desktop.mjs` and `node scripts/verify-desktop-open.mjs`. Both use disposable data roots, never the analyst database. Build artifacts, manifest and exact verification receipts follow below.

```json
{
  "version": "0.3.0-pilot",
  "nodeVersion": "24.20.0",
  "signed": false,
  "artifacts": [
    {
      "file": "Underwriting-Desk-Mac-Apple-Silicon.zip",
      "bytes": 47571506,
      "sha256": "e39425f95b94898c33ea6145bdd257092eabd18dd066385ae282dd35d892129a",
      "nativeTested": true
    },
    {
      "file": "Underwriting-Desk-Mac-Intel.zip",
      "bytes": 49319853,
      "sha256": "0a039e19208cf5e8ab29015a4cef438aa179d8ac59f5c90578a1bacfc0e19e21",
      "nativeTested": false
    },
    {
      "file": "Underwriting-Desk-Windows.exe",
      "bytes": 45657600,
      "sha256": "1d0eb8bacd5dc4915b149057e1815f92e78acdec15a0fb1bbe99810a879ba93e",
      "nativeTested": false
    },
    {
      "file": "Underwriting Desk.mcpb",
      "bytes": 3359375,
      "sha256": "42deaf13a235da629acef7199d3390b22c48da9dfc8fcf3226fef335218df625",
      "nativeTested": false,
      "binaryRoundtripTestedOn": "darwin-arm64"
    }
  ]
}
```
