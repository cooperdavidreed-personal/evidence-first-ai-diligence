# Run the local Desk

This distribution is an extracted application folder, not a signed installer. It includes the built interface and runtime scripts, without bundling Node.js, accounts, subscriptions, or private workspace data.

## For someone receiving the package

1. Extract `underwriting-desk-local.zip` fully into a folder you want to keep.
2. Install Node.js 24 or newer from [nodejs.org](https://nodejs.org) if needed.
3. Open **Open Underwriting Desk.command** on macOS or **Open Underwriting Desk.cmd** on Windows. Your browser opens after the local service is listening.
4. Keep the terminal window open. Press Ctrl+C to stop; reopen the launcher to resume.
5. Use **Model review** in the Desk for detected MCP setup instructions. This separate step uses your existing supported AI client and subscription.

If macOS blocks the unsigned launcher or its execute permission was lost during extraction, open Terminal in the extracted folder and run `node start-desk.mjs`. Do not disable security protections. If the browser does not open, visit `http://127.0.0.1:4198`. A port-in-use error means another process owns the port; close it or use another `DESK_PORT`.

State stays at `~/.underwriting-desk/reviews.sqlite`. Deleting the extracted application folder does not delete that state. Distributed cases are synthetic. MCP accesses deliberately published evidence packets and submits proposals; it does not approve investment judgment.

## For the maintainer

From `workbench`, run `pnpm build`, then:

```sh
node scripts/package-local.mjs
node --test scripts/package-local.test.mjs
```

The package and checksum go into the repository's ignored `dist/local-distribution/` folder. Included: built assets, explicitly named runtime modules, launchers, README, and a SHA-256 file manifest. Excluded: source maps, hidden files, SQLite files, private keys, tests, repository source, and node_modules. Review the build's intended contents: no file allowlist can determine whether deliberately compiled content is confidential.

Use the Desk-generated review-store MCP configuration. Legacy static repository-case mode is not portable because source case files are omitted.

Checksums detect accidental changes; they are not a publisher signature. No signed installer, auto-update service, or bundled Node runtime is provided. Native macOS/Windows launcher verification and real AI-client onboarding remain release acceptance work. Launching the local UI needs no cloud service, package-manager installation, or paid inference.

## Check a downloaded or copied folder

The launcher verifies every manifest-listed file before importing the service or opening the workspace database. An incomplete extraction or altered file stops startup with the affected filename and instructions to extract the original ZIP into a new folder. Saved workspaces are separate from the application folder.

To check files without starting the service, opening a browser, or creating a workspace database, run this inside the extracted folder:

```sh
node start-desk.mjs --check
```

To start without automatically opening a browser, use `node start-desk.mjs --no-open`. Port errors identify whether the value is invalid or already in use. Verification checks the included manifest, not a trusted external signature; someone who changes both code and manifest can bypass it. Native macOS/Windows launcher verification and installation of an older Node version are not part of the automated test proof.
