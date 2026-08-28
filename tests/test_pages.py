from __future__ import annotations

import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).parents[1]


class ResourceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.resources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name in {"href", "src"} and value:
                self.resources.append(value)


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
    assert 'class="skip" href="#content"' in page
    assert '<main id="content">' in page
    assert (
        "<caption>Citation statuses for the corrected synthetic case</caption>" in page
    )
    assert 'rel="icon" href="data:image/svg+xml' in page
    assert "VectorForge AI" not in page or "synthetic" in page.lower()
    assert (tmp_path / "data/after.json").is_file()
    assert (tmp_path / "data/after-receipt.json").is_file()
    assert not (tmp_path / "assets/app.js").exists()
    for relative in (
        "assets/styles.css",
        "data/after.json",
        "data/after-receipt.json",
        "data/before.json",
    ):
        assert (tmp_path / relative).is_file()
    parser = ResourceParser()
    parser.feed(page)
    assert parser.resources
    for resource in parser.resources:
        parsed = urlparse(resource)
        assert parsed.scheme in {"", "data"}
        if not parsed.scheme and not resource.startswith("#"):
            assert (tmp_path / parsed.path).is_file()
