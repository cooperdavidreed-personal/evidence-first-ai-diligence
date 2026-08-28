# Evidence-First AI Diligence

**Build investment-committee packets that show their work.**

This local workflow connects candidate claims, counterevidence, retained source
snapshots, unresolved questions, and content-addressed receipts. It helps a
human reviewer inspect what is supported, contradicted, blocked, or unverified.
It does not make investment decisions or provide investment advice.

> **Status: LOCAL DRAFT — NOT YET PUBLICLY VERIFIED**

Current local evidence: 19 Python tests pass, all 24 declared benchmark outcomes
match, repeated packet outputs are byte-identical, and the released Evidence
Gate and Release Gate 0.1.1 packages return `PASS` for the generated bundle.
Hosted CI remains `NOT RUN`.

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

## Render the 80-second demonstration

The source-bound demo shows failure, retained `UNVERIFIED`/`HOLD` states,
corrected inputs, deterministic rerun, open questions, and the final release
receipt. It is silent and caption-led; complete SRT and WebVTT files are checked
against the storyboard.

```bash
uv sync --locked --extra demo
uv run python scripts/render_demo.py --out dist/demo
uv run python scripts/verify_demo.py --root dist/demo
```

Local verification requires H.264 at 1920×1080 and 30 fps, a duration between
75 and 85 seconds, no audio track, matching captions, and a SHA-256-bound media
manifest. Encoder and font versions may change the MP4 bytes.

## What the project demonstrates

- Typed claim, evidence, calculation, and packet contracts
- Content-addressed, fixed-date source snapshots
- Exact-quote checks without pretending they establish semantic truth
- `Decimal` calculations for growth, margins, and ownership scenarios
- Counterevidence, temporal-leakage, and prompt-injection failure states
- Human-owned judgment and a narrow diligence workflow disposition
- Optional integration with the released Daily AI Agent Toolkit through MCP

These are local control results, not investment-accuracy or production claims.

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

The [LangChain/LangSmith public pre-diligence contract](examples/langchain-public/README.md)
shows how a recognizable private-market case remains bounded when source
retention rights and private-company economics are unavailable.

## Authorship

The proposed public attribution is recorded in [AUTHORS.md](AUTHORS.md) and
remains subject to Cooper Reed's final review before publication.
