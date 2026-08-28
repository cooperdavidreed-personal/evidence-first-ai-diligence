# Foundation migration: case v1 to v2

Status: `LOCALLY VERIFIED FOUNDATION — NO PUBLIC RELEASE`  
Public release: `NOT CLAIMED`  
Model semantic assessment: `NOT RUN`

## Why this is a versioned migration

Case v1 combined deterministic evidence mechanics with output names that could
be read as semantic conclusions. It also treated retrieval after the knowledge
cutoff as leakage, accepted free-text locators, did not enforce source tiers in
claim outcomes, and did not validate every runtime boundary against the shipped
JSON Schemas. Those are contract changes, so v2 is a schema-version bump rather
than a silent reinterpretation of v1 bytes.

The v2 runtime accepts `ic-evidence-lab.case/v2`. A v1 case must be explicitly
migrated and then rerun. Old output states are not carried forward as new
semantic labels.

## Contract changes

| Area | v1 | v2 candidate |
|---|---|---|
| Time | `as_of`, `published_at` and `retrieved_at`; a later retrieval blocked the source | `as_of` is the knowledge cutoff; publication after cutoff blocks; retrieval after cutoff adds `RETRIEVED_AFTER_CUTOFF` as a note; optional effective-period end after cutoff blocks |
| Timestamp format | Date-time checked procedurally | `generated_at` and `retrieved_at` must be timezone-aware and normalize to UTC for comparisons |
| Source identity | Path and SHA-256 | Same rooted regular-file and digest controls, plus optional SEC accession number and effective period |
| Locator | Required free-text string; quote containment search | Exact `{scheme,start,end,quote_sha256,section_label}` using `utf8-byte-offset/v1`; bytes at the range must equal the UTF-8 quote and digest |
| Source policy | Tier recorded but did not affect claim result | Strict case-level minimum-tier matrix by claim kind and materiality; the CoreWeave case requires Tier A for material facts and derived claims |
| Claim result | One state: `SUPPORTED`, `CONTRADICTED`, `UNVERIFIED`, `BLOCKED`, or `HUMAN_REVIEW` | Three independent axes: deterministic `citation_status`, semantic assessment, and human adjudication |
| Semantic layer | Implied by deterministic state names | Explicit `semantic_assessment.status = NOT_RUN` until an authorized model run exists |
| Human boundary | Judgment claims routed to `HUMAN_REVIEW` | Runtime adjudication stays `PENDING_HUMAN`; human labels live in a separate, provenance-bound record and do not alter control disposition in this foundation slice |
| Injection signal | `PROMPT_INJECTION_PATTERN` sounded like a protection result | `INJECTION_HEURISTIC_MATCH` is a blocking quarantine signal only; no robustness claim |
| Capacity | 12 sources, 40 claims | 64 sources, 200 claims, with separate per-source and total-case byte limits |
| Schema enforcement | Schemas existed primarily as artifacts | Draft 2020-12 schemas are shipped as package data and invoked at input and packet/receipt egress; additional properties fail closed |
| Evaluation name | 24 cases described as a benchmark | Deterministic regression suite; it exercises branches and mutations, not model quality |

## v2 result semantics

`citation_status` says only what deterministic checks established:

- `LOCAL_CITATION_BYTES_MATCH`: at least one admissible evidence span passed byte,
  digest, source and tier checks.
- `LOCAL_EVIDENCE_AND_COUNTER_BYTES_MATCH` or `LOCAL_COUNTER_BYTES_MATCH`: cited bytes were located in the declared roles. This
  does not itself mean the claim is contradicted.
- `CITATION_BYTES_MISMATCH`: a locator, quote, hash, source reference, required tier,
  or other citation check failed.
- `NO_CITATIONS`: no verified evidence or counterevidence was supplied.
- `SOURCE_CONTROL_BLOCKED`: a cited source failed a blocking source control.
- `CALC_CONTROL_MISMATCH`: a declared arithmetic check failed or mismatched.

These statuses do not answer whether a claim is economically meaningful,
whether two definitions contradict, or whether an investment should advance.
Semantic assessment remains `NOT_RUN` until Cooper authorizes the gold-label
protocol and model execution. Runtime adjudication remains `PENDING_HUMAN`;
future human outcomes belong in separate digest-bound label records.

For a high-materiality claim, citation failure, no citations, a blocked source,
or a calculation mismatch holds the workflow. Verified counterevidence also
requires human resolution. The packet's investment decision remains
`PENDING_HUMAN` and the decision owner remains `HUMAN`.

## Deterministic migration procedure

1. Preserve the original v1 case and all referenced source bytes.
2. Run the explicit migration utility against the case root, supplying a
   human-confirmed RFC 3339 cutoff and one confirmed publication instant for
   every source; date-only v1 fields are never silently converted to invented
   instants.
3. Add the default v1-compatible source-policy matrix.
4. For every evidence and counterevidence quote, locate the exact UTF-8 byte
   sequence in the referenced frozen file. Migration fails if the quote is
   absent or appears more than once; ambiguity requires manual selection.
5. Replace the text locator with start/end offsets, quote SHA-256 and the prior
   locator text as `section_label` when available.
6. Validate the migrated object against the strict v2 case schema.
7. Rerun the case to generate v2 packet and receipt artifacts. Never translate
   a v1 claim state directly into a semantic assessment or adjudication.
8. Compare canonical outputs, digests and declared regression expectations;
   retain both the v1 input digest and v2 output digest in the migration
   receipt.

The migration is intentionally fail-closed. Duplicate quote text, missing
source bytes, digest drift, symlinks/path escapes, malformed dates, unknown
fields or schema violations require correction at the source or case record;
the utility must not guess.

## Local acceptance evidence

- 35 tests pass on Python 3.11, 3.12 and 3.13, including strict schema,
  locator-tamper, temporal-boundary, source-tier, calculation,
  path-containment and canonical-receipt cases.
- All 24 deterministic regression mutations produce their declared v2
  outcomes and are not presented as AI evaluation.
- The schemas are present and usable in built wheel and source distributions.
- A root-preserving review archive installs and passes the full declared suite
  from a clean extracted directory.
- A read-only adversarial re-review returned `FOUNDATION_ACCEPTED` after the
  disposition-forgery and migration time-of-check gaps were closed.

These are local foundation controls, not a completed CoreWeave source pack,
human-labeled evaluation, hosted workbench, public release, or product-quality
claim.
