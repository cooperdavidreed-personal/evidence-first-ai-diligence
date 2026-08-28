from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_schema_documents_are_json_and_versioned() -> None:
    expected = {
        "case.schema.json": "IC Evidence Lab Case",
        "packet.schema.json": "IC Evidence Lab Packet",
        "receipt.schema.json": "IC Evidence Lab Receipt",
    }
    for name, title in expected.items():
        document = json.loads((ROOT / "schemas" / name).read_text())
        assert document["$schema"].endswith("2020-12/schema")
        assert document["title"] == title
