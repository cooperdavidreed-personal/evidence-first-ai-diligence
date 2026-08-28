from __future__ import annotations

import json
from pathlib import Path

from ic_evidence_lab.cli import main


ROOT = Path(__file__).parents[1]


def test_cli_writes_packet_and_receipt(tmp_path: Path, capsys) -> None:
    result = main([
        "run",
        "--case",
        str(ROOT / "examples/vectorforge/case-before.json"),
        "--out",
        str(tmp_path),
    ])
    assert result == 0
    output = json.loads(capsys.readouterr().out)
    assert output["status"] == "PRODUCED"
    assert (tmp_path / "packet.json").is_file()
    assert (tmp_path / "receipt.json").is_file()
    assert (tmp_path / "memo.md").is_file()
