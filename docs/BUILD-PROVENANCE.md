# Build Provenance and Model Roles

## Authority model

Codex is the sole filesystem writer. Claude provides read-only architecture, econometrics, synthesis, and independent critique. Grok is limited to read-only reference research and alternate hypotheses. Provider output is advisory: it becomes part of the candidate only when Codex translates it into code or documentation and deterministic checks accept the result.

No API-key or paid fallback route is authorized. No provider output is case evidence, and model attribution does not appear in the primary IC interface.

## Recorded advisory work

| Order | Provider role | Result | Treatment |
|---|---|---:|---|
| Product and editorial contract | Claude | `PRODUCED` | Frozen into `docs/UNDERWRITING-PRODUCT-CONTRACT.md` before results |
| Econometrics and DGP contract | Claude | `PRODUCED` | Frozen into `docs/ECONOMETRICS-CONTRACT.md` before results |
| Reference-pattern red team | Grok | `HELD_PROVIDER` after retry ceiling | Partial output retained as nonauthoritative advisory evidence; not used as verified research |
| Investment/econometrics review | Claude | `PENDING` | Required before final candidate status |
| Independent final acceptance | Claude | `PENDING` | Required before `PORTFOLIO_CANDIDATE_READY_FOR_FOUNDER_REVIEW` |

Durable provider stdout, state events, and episode receipts live in the excluded local mission directory, not the proposed public package.

## Claim discipline

Passing tests demonstrate local contract behavior on synthetic cases. They do not establish enterprise deployment, real diligence accuracy, comprehensive accessibility compliance, model superiority, or an investment track record. Hosted CI, publication, model benchmarks, CoreWeave labels, and public resume/LinkedIn claims remain outside this mission.
