from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_static_pages_are_built_from_canonical_cases(tmp_path: Path) -> None:
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/build_pages.py"), "--out", str(tmp_path)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    page = (tmp_path / "index.html").read_text()
    assert "Build investment memos that show their work" in page
    assert "does not make investment decisions" in page
    assert "VectorForge AI" not in page or "synthetic" in page.lower()
    assert (tmp_path / "data/after.json").is_file()
    assert (tmp_path / "data/after-receipt.json").is_file()
    assert not (tmp_path / "assets/app.js").exists()
