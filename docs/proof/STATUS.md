# Verification status — desktop pilot 0.3.4

Status: **VERIFIED_LOCAL_SYNTHETIC**. Source branch: `codex/desk-workflow-proof-20260908`. Application code revision: `a4ca904514e06829aa75f0dc2492d73f7aa5a25c`. The following documentation commit does not change the packaged application.

The actual Claude Desktop installation and connection now work. Claude read the released synthetic original and revised packages and submitted two source-linked proposals on the installed 0.3.3 runtime. Its deal-list response exposed an older-client schema incompatibility: array results were included in structuredContent. The 0.3.4 fix preserves the JSON text result and includes structuredContent only for objects. The updated extension was installed in Claude, and the exact deal-list call then returned the expected company and release digest. [Native observation](native-claude-verification.json).

The agent exercised the analyst review UI on synthetic data: corrected an unsupported model inference, adopted both proposals, assigned the funding question, marked the earlier conclusion contradicted, reconciled the current conclusion, and saved a partner update. Source bytes/mappings, assumptions, review basis and source version remained unchanged. Saving revoked the old evidence release. This is a developer-run integration test, not independent practitioner validation.

| Check | Result |
|---|---|
| TypeScript and Vite production build | Passed; oversized synthetic-data chunk warning remains |
| React/Vitest | 245 passed |
| Node server/MCP | 37 passed, including native-client response regression |
| Go launcher/install/recovery | Passed |
| Numeric citation fixtures | 12/12 authored public fixtures; not blinded evaluation |
| Retained financial proof | 200 seeded Decimal cases and 9 Python finance/PE tests from the preceding operating-workflow increment |
| Operating browser workflow | Source replacement, stale output, inspection, diligence, contradiction, reconciled update and reopen passed |
| Nonstandard workbook | Author-created sparse layout with GBP thousands and explicit mappings passed; original bytes retained |
| Proposal review | Current adoption and stale dismissal passed; financial inputs unchanged |
| Partner PDF | Actual print HTML rendered; both pages visually inspected in preceding 0.3.3 increment; output code unchanged in 0.3.4 |
| Apple Silicon package | Extracted application, bundled runtime without Node on PATH, recovery page, matching extension download, packaged MCP binary, quit/reopen, persistence and service reuse passed |
| Actual Claude Desktop | Extension install/update, connection, released retrieval and proposals exercised; corrected deal list passed on 0.3.4 |

[Package hashes](desktop-0.3.4-artifacts.json), [start guide](../../trial/DESKTOP-START.md), [earlier workflow evidence](../../verification/workflow-proof-20260908/README.md).

Pending: native Windows and Intel execution, downloaded-file quarantine on the intended device, managed workstation permissions, independent practitioner trial, broader adversarial security review and recovery on the intended device. WebKit was not rerun for the new workflow. Mac signing is ad-hoc only; Windows is unsigned. Neither artifact has a trusted publisher certificate or Apple notarization.

No firm-wide identity/roles or concurrent team collaboration is claimed. The AWS slice remains source-only and undeployed. This release does not change the public Vercel demonstration. No measured human time saving, independent adoption, production uptime or investment-performance result exists. Installation friction and workflow usefulness must be tested by the practitioner.
