# Local verification receipt

Status: `VERIFIED_LOCAL — PUBLICATION NOT AUTHORIZED`

Implementation commit tested:
`5f75496a07e4d4c5fcb02802f097ef48c27c9998`

Environment: macOS, Python 3.11. Hosted CI on Ubuntu/macOS and Python
3.11–3.13 remains `NOT RUN` until the repository is pushed.

## Results

- Python tests: 16/16 passed.
- Executable benchmark: 24/24 declared outcomes matched across eight families.
- Public-tree scan: 57 candidate files, zero findings.
- Repeated packet, memo, and receipt outputs: byte-identical.
- Released `dailyaiagents-evidence-gate==0.1.1`: exact four-tool discovery and
  `verify_artifact` result `PASS` through MCP stdio.
- Wheel and source distribution: built successfully.
- Clean wheel install with `--no-deps`: CLI case and benchmark both passed.
- Static Pages artifact: generated locally. Its unchanged layout generator was
  inspected at 1440x1000, 768x900, and 390x844 before the final non-layout
  hardening commit, with zero horizontal overflow and zero console warnings or
  errors. Exact-final-digest visual review and automated accessibility remain
  `NOT RUN`; a cosmetic favicon request returned 404.
- LangChain/LangSmith case: contract-only, URL-only, and explicitly
  `UNVERIFIED`; no third-party page bytes retained.

## Digests

- Benchmark results file bytes (`sha256sum verification/benchmark-results.json`):
  `62897aa7ae036e6a41649f2f8dbe32c7aab84ffbe567b88f45369aa91c1f26bd`
- Wheel:
  `75090f54b5ebbd4951cd70a6bc840f17b8a00a1ea34c92de77f48927c6845b41`
- Source distribution:
  `6bcb155d18f02a4c9c273b053f8ad8fe32d96e34c3c2b22b65175d9b74692276`
- Generated Pages index:
  `b2a0a2464925a3d69110ca757d2bb1638858202165eb7e8927d16f7efe048004`

## Boundaries

These results establish local behavior of the named bytes. They do not prove
semantic truth, investment accuracy, production reliability, public
availability, hiring impact, AWS capability, or GH-600 readiness. Publication,
license selection, résumé wording, and human investment judgment remain founder
gates.
