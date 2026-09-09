# Measurement and comparison protocol

No analyst savings have been measured. The included browser run is an automated synthetic correctness check, not a human task benchmark.

The optional task panel starts a Desk or Excel + assistant session. The analyst counts manual corrections and finishes as completed, failed or abandoned. Export the result locally or delete it. Elapsed time uses a monotonic clock while the same process remains alive; after a restart it is unknown. Instrumented local HTTP store operations provide component timings, not external Claude latency. MCP timing names are reserved but not instrumented end to end.

Provider spending, subscription allocation and hardware costs are unknown in task exports. The fixed deterministic evaluation records zero model calls and zero marginal provider spending for that evaluation only. Neither claim means a workstation or subscription is free.

## Independent practitioner protocol

1. Use two matched fictional or appropriately approved company packages, each with an initial delivery and a later revision. Declare the investment question and expected output before starting.
2. Have the analyst perform one task in Excel + their usual assistant and one in the Desk. Reverse the order on a second matched pair to reduce learning effects. Use equivalent source access and the same output requirements.
3. Record setup separately from task time. Start at materials received; finish when a reviewer accepts the partner update. Record manual corrections, duplicate entry, missed decision-changing facts, failed attempts and interventions. Do not quietly remove failures.
4. An independent reviewer checks source correctness, economic interpretation, unresolved questions and requested action against a prespecified rubric. Keep author-written fixture labels separate from these human grades.
5. Compare paired results and retain denominators and individual observations. A small trial supports a case narrative, not population p95s or broad savings percentages. Report preparation, model wait and review time separately where observable; otherwise mark unknown.
6. Ask what manual work the analyst would stop doing, what still requires reconstruction, and whether they voluntarily return. A repeat visit is stronger evidence than praise during a guided demo.

The twelve numeric fixtures are public, authored synthetic checks split into development and holdout files. The holdout is inspectable, not blinded or independently labelled. They measure mapped numeric support only. No retrieval or general prose-entailment accuracy is claimed.
