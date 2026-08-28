# Architecture

The system deliberately separates probabilistic research from deterministic
release evidence. The initial public slice is entirely offline:

1. A human defines the target, cutoff date, and admissible source policy.
2. Sanitized snapshots enter a content-addressed local source pack.
3. Candidate claims declare exact evidence and counterevidence spans.
4. Code checks paths, hashes, dates, literal containment, and `Decimal` math.
5. Semantic assessment remains `NOT_RUN`, adjudication remains `PENDING_HUMAN`, and material gaps keep the workflow on `HOLD`.
6. The packet and receipt are serialized deterministically and hashed.
7. The released toolkit can independently inspect artifacts through MCP.

No agent has authority to fetch new material, alter the cutoff, publish a
packet, contact a company, trade, or approve an investment.

## Bounded future model roles

If model-backed research is added, it will use three roles only: evidence
analyst, contradiction analyst, and synthesis/review manager. Retrieval,
permissions, calculations, budgets, citations, and final gates remain code-owned.
