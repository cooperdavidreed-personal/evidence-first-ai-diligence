# Local verification receipt

Status: `VERIFIED_LOCAL — PUBLICATION AUTHORIZED; PERSONAL CLI AUTH PENDING`

Implementation commit tested:
`a0852a655891c17803bf01761488a4f3f3cc68c9`

Environment: macOS, Python 3.11, ffmpeg 8.1.2. Hosted CI on Ubuntu/macOS
and Python 3.11–3.13 remains `NOT RUN` until the repository is pushed.

## Results

- Python tests: 20/20 passed.
- Executable benchmark: 24/24 declared outcomes matched across eight families.
- Public-tree scan: 67 candidate files, zero findings.
- Repeated packet, memo, and receipt outputs: byte-identical.
- Released `dailyaiagents-evidence-gate==0.1.1`: exact four-tool discovery and
  three artifact-verification receipts returned `PASS` through MCP stdio.
- Released `dailyaiagents-release-gate==0.1.1`: exact four-tool discovery and
  the three-artifact release receipt returned `PASS` through MCP stdio.
- Wheel and source distribution: built successfully.
- Apache-2.0 license text matches the authoritative Apache source byte-for-byte;
  wheel metadata and bundled license files agree.
- Clean wheel install with the `toolkit` extra: CLI case, both MCP gates, and
  the 24-case benchmark passed.
- Static analysis: Ruff passed; Bandit found zero medium/high-severity issues.
- Locked dependency audit: pip-audit found no known vulnerabilities.
- Static Pages artifact: generated locally and visually inspected at 1440×900
  and 390×844. No horizontal overflow was observed; proof links, skip link,
  main landmark, table caption, focus affordances, and data favicon were present.
- Portfolio demo: rendered and visually inspected across all seven scenes. The
  machine check passed at exactly 80.0 seconds, H.264, 1920×1080, 30 fps,
  `yuv420p`, with no audio stream and exact SRT/WebVTT caption copies.
- Independent Claude delta review at commit `74813ad` returned
  `ACCEPTABLE_RELEASE_CANDIDATE`. Its two durable-evidence findings—stale local
  receipt and missing security CI—were closed in `393fbf4` and reverified.
- LangChain/LangSmith case: contract-only, URL-only, and explicitly
  `UNVERIFIED`; no third-party page bytes retained.

## Digests

- Benchmark results (`verification/benchmark-results.json`):
  `62897aa7ae036e6a41649f2f8dbe32c7aab84ffbe567b88f45369aa91c1f26bd`
- Wheel:
  `178aee814abe4122c24f0e03e8c7552712b2c697e15186578574bd9963eaa413`
- Source distribution:
  `c1cfb0e9ff6d4b49e2bc4a4e405359f41b55f9af754126f80690b699b426f747`
- Generated Pages index:
  `2c50004e9bfcbaa8689004b4a4496393b2f9f42caea8726d1e1ac1a9dfc8ff7f`
- Rendered demo video:
  `edb5630f23133a6263905fb74c28f98dff4ab4a06354782811d5d74374bcf1fc`

## Boundaries

These results establish local behavior of the named bytes. They do not prove
semantic truth, investment accuracy, production reliability, public
availability, hiring impact, AWS capability, or GH-600 readiness. Hosted CI,
publication, final résumé wording, and human investment
judgment remain separate gates.
