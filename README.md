# Evidence-First AI Diligence

**Build investment-committee packets that show their work.**

This local workflow connects candidate claims, counterevidence, retained source
snapshots, unresolved questions, and content-addressed receipts. It helps a
human reviewer inspect what is supported, contradicted, blocked, or unverified.
It does not make investment decisions or provide investment advice.

> **Status: LOCAL DRAFT — NOT YET PUBLICLY VERIFIED**

## See the evidence fail and repair

```bash
python -m venv .venv
.venv/bin/pip install -e .

ic-evidence-lab run \
  --case examples/vectorforge/case-before.json \
  --out dist/before

ic-evidence-lab run \
  --case examples/vectorforge/case-after.json \
  --out dist/after
```

The first case leaves a material growth claim unsupported. The corrected case
adds retained evidence, deterministic calculations, counterevidence, and a
post-cutoff source that must be rejected. Both runs preserve their limitations.

## What the project demonstrates

- Typed claim, evidence, calculation, and packet contracts
- Content-addressed, fixed-date source snapshots
- Exact-quote checks without pretending they establish semantic truth
- `Decimal` calculations for growth, margins, and ownership scenarios
- Counterevidence, temporal-leakage, and prompt-injection failure states
- Human-owned judgment and a narrow diligence workflow disposition
- Optional integration with the released Daily AI Agent Toolkit through MCP

## Trust boundary

```text
untrusted retained sources
          |
          v
candidate facts, calculations, and judgments
          |
          v
deterministic local checks ----> explicit limitations
          |
          v
human review and primary diligence
          |
          v
packet plus hash-bound receipt
```

The current slice performs no URL fetching, model calls, trading, cloud
deployment, or automated investment recommendation. See
[Architecture](docs/ARCHITECTURE.md), [Threat Model](docs/THREAT-MODEL.md), and
[Career Claims](docs/CAREER-CLAIMS.md).

## Authorship

The proposed public attribution is recorded in [AUTHORS.md](AUTHORS.md) and
remains subject to Cooper Reed's final review before publication.
