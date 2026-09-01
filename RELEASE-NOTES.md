# Underwriting Desk unified release candidate

Status: `FINAL ACCEPTANCE AND PUBLIC REBIND IN PROGRESS`

This release unifies the prior Underwriting Intelligence Lab and Underwriting Desk work into one product: one repository, five-destination decision workspace, two retained synthetic cases, one supported public intake, partner-facing PDFs, a bounded hosted model proposal flow, a proposal-only local MCP surface, and a single canonical public URL.

## Release highlights

- Northstar intake no longer self-authorizes through package thresholds. Its reproducible 83.6% ordinary-cohort NRR is a visible blocker and the complete package remains `SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED`.
- Missing or modified required files fail closed with `NO CALL — PACKAGE INCOMPLETE` and no return conclusion.
- Canonical cases are separated from editable what-if scenarios, analyst assumptions, and fund policy.
- Users can add observations, manage diligence issues, review assumptions, inspect exact evidence, process cited model proposals through named human disposition, edit the memo, and export or restore portable state.
- AtlasGrid and Helios retain deterministic PE and growth-financing mechanics, econometric interpretation, interactive sensitivities, one-page IC snapshots, underwriting packets, and separate technical appendices.
- The interface uses a compact institutional shell, persistent decision rail, split document preview, plain-language analytical interpretation, and responsive desktop/mobile layouts.

The exact commit, test results, hosted endpoint result, demo identity, public deployment, independent reviews, and remaining limitations will be recorded in the unified release receipt. Observed practitioner testing remains `NOT RUN`.
