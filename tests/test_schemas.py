from __future__ import annotations

from ic_evidence_lab.schema import load_schema


def test_schema_documents_are_json_and_versioned() -> None:
    expected = {
        "case.schema.json": "IC Evidence Lab Case",
        "packet.schema.json": "IC Evidence Lab Packet",
        "receipt.schema.json": "IC Evidence Lab Receipt",
        "gold-label.schema.json": "IC Evidence Lab Gold Label",
    }
    for name, title in expected.items():
        document = load_schema(name)
        assert document["$schema"].endswith("2020-12/schema")
        assert document["title"] == title
