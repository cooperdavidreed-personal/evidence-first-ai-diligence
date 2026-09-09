Current follow-up: [0.3.4 native-client verification](STATUS.md). The observations below are historical.

# Desktop onboarding recovery — 0.3.2 local candidate

The next trial-readiness episode checked Claude Desktop directly. Version 1.49585.0 was signed in, its Extensions screen showed no installed desktop extensions, and Settings → Extensions → Advanced settings exposed Install extension and a Preview file picker. The previous synthetic chat demonstrated an older connector, not the new native extension package.

The file picker did not complete selection through CUA (including a clipboard-read timeout and path navigation returning to the root). No new extension was installed and no new Claude model request was submitted. This is a computer-control limitation observed during the test, not evidence that manual import is broken. The native import and provider roundtrip remain UNVERIFIED. A Go to Folder dialog may still be open in Claude; it can be cancelled manually.

Implemented: authenticated download of the exact bundled MCPB; manual-import guidance inside setup; server-authoritative expired-code status; disabled copying for expired/used codes; refreshed setup status after reopening. The old connector and existing company database were not changed by the native inspection. No publication or external message was made.

Checks: TypeScript/build, four onboarding UI tests, all 36 server tests, including two onboarding tests covering authentication/origin, download bytes/method restriction and one-time expiry. The packaged Mac browser check also downloads the extension, compares it byte-for-byte to the bundle, then exercises the bundled connector handshake. This handshake is explicitly not Claude import proof.

Next acceptance: open the new native Desk, download its extension from setup, manually import it into Claude, then generate and submit the fresh connection-test prompt. Only the Desk's verified response completes that test. On a managed device, organizational approval remains separate. Windows/Intel native execution remains unrun.

[Retained package verification](onboarding-recovery-verification.json). Built package version 0.3.2-local; source commit is the commit adding this report. Files in dist are local and have not replaced the public release.
