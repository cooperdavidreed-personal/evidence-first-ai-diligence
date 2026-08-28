from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_langchain_case_does_not_promote_url_only_sources() -> None:
    case_root = ROOT / "examples/langchain-public"
    sources = json.loads((case_root / "source-register.json").read_text())
    claims = json.loads((case_root / "claims.json").read_text())
    assert sources["status"] == "URL_ONLY_UNVERIFIED"
    assert all(source["retained_bytes"] is False for source in sources["sources"])
    assert all(claim["state"] in {"UNVERIFIED", "BLOCKED"} for claim in claims["claims"])
    assert any(claim["state"] == "BLOCKED" for claim in claims["claims"])
    assert "not `INVEST`" in (case_root / "memo.md").read_text()
