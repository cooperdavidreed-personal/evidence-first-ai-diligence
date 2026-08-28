# Proposed gold-label protocol

Status: `PROPOSED — HUMAN APPROVAL REQUIRED`  
Model evaluation runs: `NOT AUTHORIZED`  
Ground-truth owner and final adjudicator: Cooper David Reed

## Purpose and non-claims

This protocol defines a prospective human-labeled evaluation for the frozen
CoreWeave public-source pack. It does not authorize a model call, establish a
benchmark result, or support a model-performance or investment-performance
claim. The existing 24 deterministic mutations are software regression tests,
not AI evaluation tasks.

## Fixed task inventory and split

The proposed corpus contains exactly 120 tasks: eight task families with 15
tasks per family. Each family contributes 10 development tasks and five
held-out tasks, yielding 80 development and 40 held-out tasks.

| Family | Total | Dev | Held out | Required human outcome |
|---|---:|---:|---:|---|
| Atomic claim and exact-span extraction | 15 | 10 | 5 | Atomic claim plus exact byte span, or justified abstention. |
| Period, unit, currency and definition matching | 15 | 10 | 5 | Normalized fields with any mismatch identified. |
| Cross-document definition reconciliation | 15 | 10 | 5 | Same, different, narrower, broader, or unresolved definition. |
| Counterevidence and contradiction detection | 15 | 10 | 5 | Counterevidence span and relationship, without presuming contradiction. |
| Multi-step numerical calculation | 15 | 10 | 5 | Operands, operation, units, tolerance and result. |
| Temporal-cutoff compliance | 15 | 10 | 5 | Admissible, blocked, or retrieved-after-cutoff note with rationale. |
| Justified abstention | 15 | 10 | 5 | Answerable/abstain label and missing evidence. |
| Investment-implication classification | 15 | 10 | 5 | Human rubric category, rationale and uncertainty; never an autonomous decision. |
| **Total** | **120** | **80** | **40** | |

Exactly 24 tasks (20%) will be independently double-labeled before
adjudication: three from each family, consisting of two development and one
held-out task per family. This produces 16 double-labeled development tasks and
eight double-labeled held-out tasks. Task IDs and split assignments must be
generated and committed before labels are written. Held-out labels remain
sealed from prompt and system development.

## Proposed label record

The machine contract is shipped as
`src/ic_evidence_lab/schemas/gold-label.schema.json`; it is proposed only and
does not constitute approved ground truth.

Each label is one strict, schema-validated record with no additional fields:

| Field | Required content |
|---|---|
| `schema_version` | `ic-evidence-lab.gold-label/v1` |
| `task_id` | Stable opaque ID; no label information encoded. |
| `family` | One of the eight fixed family identifiers. |
| `split` | `DEV` or `HELD_OUT`. |
| `source_pack_sha256` | Digest of the frozen source-pack manifest. |
| `as_of` | RFC 3339 knowledge-cutoff instant. |
| `prompt_sha256` | Digest of the canonical task input. |
| `claim` | Atomic statement, or `null` when the correct outcome is abstention. |
| `citation_status` | Human-verified citation outcome, kept separate from semantics. |
| `evidence` | Ordered exact locators: source ID, UTF-8 byte start/end, quote SHA-256 and section label. |
| `counterevidence` | Same locator structure; an empty list is allowed. |
| `normalized_fields` | Period, currency, unit, metric and definition identifiers when applicable. |
| `semantic_label` | `SUPPORTED`, `COUNTERSUPPORTED`, `DEFINITION_RECONCILIATION_REQUIRED`, `INSUFFICIENT_EVIDENCE`, `NOT_APPLICABLE`, or `ABSTAIN`. |
| `calculation` | Decimal operands, operation, expected value, tolerance and unit, or `null`. |
| `investment_implication` | Rubric category and rationale for that family only, otherwise `null`. |
| `uncertainty` | Explicit unresolved issues and missing evidence. |
| `labeler_id` | Pseudonymous stable human labeler ID. |
| `labeled_at` | Timezone-aware timestamp. |
| `label_sha256` | Digest of the canonical record excluding this field. |

The task definition must separately store the admissible source IDs and
expected output shape. It must never expose the label, adjudication rationale,
held-out status, or answer-bearing filename to a candidate system.

## Labeling and adjudication procedure

1. Freeze exact SEC bytes and a canonical manifest; record source metadata,
   accession IDs, filed/furnished status, retrieval time, publication time and
   SHA-256.
2. Draft all 120 tasks from that frozen pack, then lock task IDs, family counts,
   split assignments and the 24-item double-label sample.
3. Label from the frozen evidence only. A labeler must cite exact spans and may
   abstain; unsupported inference is not converted into ground truth.
4. The second labeler works independently and cannot see the first label.
5. Compare canonical labels field by field. Publish counts and categories of
   disagreement; do not erase disagreement by reporting adjudicated labels
   alone.
6. Cooper adjudicates disagreements with a dated rationale. Preserve both
   original labels, the adjudicated record and their hashes.
7. Hash the complete label manifest before any final model run. Any later label
   correction creates a new version and invalidates prior final-run comparisons.

Agreement must be reported by family and field, not only as one percentage.
For categorical labels, report raw agreement and an appropriate chance-adjusted
measure when sample size permits. Exact-span agreement must distinguish exact
byte match from partial overlap. Small denominators and undefined metrics must
be printed explicitly.

## Authorization gate for future evaluation

No Codex, Claude, Grok, ChatGPT, local-model, routed-system, or baseline
evaluation may run against these tasks until Cooper approves, in writing:

- the frozen source-pack digest and redistribution treatment;
- all 120 task definitions and the 80/40 split;
- the label schema and scoring code;
- the 24-task independent double-label sample;
- resolved and unresolved label disagreements; and
- a maximum run, cost, provider-data and retention budget.

After approval, candidates must receive identical task inputs and admissible
sources. No model may create its own ground truth, grade its own answer, inspect
held-out labels, or tune on held-out failures. Raw outputs, failures, latency,
cost basis, provider/model identifiers, parameters and three-run stability must
be retained. Results remain `NOT RUN` until that authorized execution occurs.
