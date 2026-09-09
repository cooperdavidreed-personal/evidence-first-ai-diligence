# Numeric citation and financial evaluation

The manifest freezes separate development and holdout files by SHA-256. Expected labels are author-declared synthetic facts. The holdout is public and inspectable: it is not blinded, independently human-labeled or claimed untouched. Changes require a new manifest and a new evaluation revision; do not silently tune and overwrite an earlier result.

Cases include a matching fact, a false number with a valid source, a real citation to the wrong metric, wrong period/currency/scenario, a missing reference and a future delivery. `checkMetricClaim` checks numeric agreement and the selected basis only. It does not claim arbitrary narrative entailment, retrieval accuracy, hallucination detection or general investment accuracy.

The separate Python Decimal oracle runs 200 seeded input sets with zero/negative revenue and loss cases. Existing PE tests retain their independent debt and XIRR references. Keep those arithmetic tests separate from any future human grading of business interpretation.

Run `node workbench/scripts/evaluate-operating.mjs`. Its output records the Git revision, dirty state, fixture hashes, denominator, failures and individual elapsed times. No p95 claim is made from twelve tiny cases. Zero provider requests applies to this deterministic evaluation only; subscription allocation and hardware/energy remain unknown.
