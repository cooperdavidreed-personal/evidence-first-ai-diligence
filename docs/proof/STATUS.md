# Verification status — local candidate

Latest follow-up: [0.3.2 onboarding recovery](ONBOARDING-RECOVERY.md) adds matching extension download and expired-code handling. Its build, four focused UI tests, all 36 server tests and rebuilt native Mac package passed; actual Claude import remains unverified. The 242-test full UI result below belongs to the preceding increment.

Status: **VERIFIED_LOCAL_SYNTHETIC**. Source branch: `codex/desk-workflow-proof-20260908`, based on `c1d24f2`. The [retained evidence](../../verification/workflow-proof-20260908/README.md) identifies the tested code revision. This candidate has not been published, pushed, merged or deployed.

| Check | Result |
|---|---|
| TypeScript and Vite production build | Passed; oversized synthetic data chunk warning remains |
| React/Vitest | 242 tests passed |
| Node server/MCP | 36 tests passed |
| Legacy package tests | 6 tests passed |
| Go launcher/install | 4 tests passed |
| Retained Python finance primitives / PE oracles | 9 tests passed |
| Independent monthly Python Decimal oracle | 200 seeded cases passed |
| Numeric citation fixtures | 12 / 12 passed; authored public fixtures, not blinded human evaluation |
| Browser operating workflow | Source replacement, stale output, source inspection, diligence, contradiction, reconciled update, measurement and reopen passed |
| Extracted local package | MCP retrieval/proposal and encrypted backup/delete/restore passed |
| Apple Silicon native package | Extracted app, bundled runtime without Node on PATH, packaged MCP handshake, wizard, quit/reopen and owned-service reuse passed |
| AWS synthetic handler | 4 local checks passed with simulated authorizer claims; not real AWS authentication |

Pending: native Windows and Intel execution; actual Claude Desktop import and provider roundtrip for this example; managed workstation permissions; independent practitioner trial; broader adversarial security review; disaster recovery on the intended device. This increment's browser workflow was checked in Chrome; WebKit was not rerun for it.

The AWS slice is source-only and undeployed. SAM validation, real JWT checks, IAM/log retention review, cloud costs and rollback have not run. The current public download remains the earlier desktop build; this local package is not yet available from that link.

Keep correctness results separate from usefulness. There is no measured human time saving, independent adoption, production uptime or investment-performance result.
