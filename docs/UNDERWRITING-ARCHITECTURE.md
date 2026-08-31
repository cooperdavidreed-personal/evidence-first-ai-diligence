# Underwriting Intelligence Lab Architecture

## System boundary

The lab is a static, offline reference implementation. Python produces canonical synthetic data rooms and analysis JSON; React reads only the generated workbench payload. No browser-side model call, database, authenticated service, URL fetch, trading action, or cloud dependency exists.

```text
seed + frozen generator contract
            |
            +--> case/data/* + manifest.json
            |          |
            |          v
            |    runtime analytics
            |          |
            |          +--> hashed receipts
            |          +--> scenario book
            |          +--> thesis graph
            |          +--> decision record
            |                     |
            |                     v
            |              static React JSON
            |
            +--> verification/truth/*
                       |
                       +--> recovery ledger only
```

Runtime analytics receive the case manifest path. The manifest may reference only relative, contained paths whose current SHA-256 matches the frozen artifact record. Verification truth is placed in a sibling directory and is never named by the runtime manifest or serialized into `cases.json`.

## Contracts

The companion layer ships 24 underwriting schemas in addition to the four
preserved evidence-kernel schemas. They cover the shared manifest, analysis,
decision, scenario, thesis, lineage, metric/formula, review-bundle, and
workbench contracts plus the case-specific PE and VC engine records. The
package-content gate verifies that exact inventory; new schemas cannot enter a
release as undeclared files.

Every analysis is classified as `DESCRIPTIVE`, `PREDICTIVE_ASSOCIATION`, `CAUSAL_SYNTHETIC_ONLY`, `SCENARIO`, `ACCOUNTING_IDENTITY`, or `NOT_IDENTIFIED`. Predictive outputs require uncertainty. Synthetic causal outputs require a declared assignment mechanism. Nonidentified questions retain an `ABSTAIN` state.

The UI's lineage drawer is not a decorative citation link: each headline metric must resolve to a unique lineage node, artifact ID, source field, and analysis receipt. Missing lineage fails tests and should force `HOLD` in any future decision workflow.

## Case design

AtlasGrid and Helios reuse the same manifest, receipt, scenario, thesis, and decision machinery. Case-specific generators create decision-relevant distortions, while shared verification enforces deterministic output, truth isolation, digest integrity, and schema validation.

Statistical estimates use NumPy and SciPy with predeclared tolerances. Canonical files and manifests are byte deterministic; floating-point estimates are tested against declared numerical intervals rather than misleading cross-BLAS byte identity.

## Decision boundary

The program verifies whether a record is complete and whether declared numerical gates pass. It does not decide whether an investment should be made. `REPRICE` and `INVEST` are separately attributed illustrative human IC records. CoreWeave and all real-company recommendations remain `NOT_RUN`.
