#!/usr/bin/env python3
"""Fail closed on page counts, tagging, and audience-content boundaries."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXED_DATE = b"D:20260829000000+00'00'"
PRIMARY_BANS = (
    re.compile(r"[0-9a-f]{32,}", re.I),
    re.compile(
        r"\b(?:SHA-?256|receipt|Claude|Codex|Grok|OpenAI|Anthropic|provider identity|model provider|agent framework|test framework|founder review)\b",
        re.I,
    ),
    re.compile(r"\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b"),
)


def text(path: Path) -> str:
    result = subprocess.run(
        ["pdftotext", path.as_posix(), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def verify(path: Path, *, exact_pages: int | None = None, minimum_pages: int = 1, primary: bool) -> int:
    data = path.read_bytes()
    if not data.startswith(b"%PDF-"):
        raise ValueError(f"pdf_header_invalid:{path.name}")
    if b"/Encrypt" in data:
        raise ValueError(f"pdf_encryption_forbidden:{path.name}")
    for marker in (b"/StructTreeRoot", b"/MarkInfo", b"/Marked true"):
        if marker not in data:
            raise ValueError(f"pdf_tagging_missing:{path.name}:{marker.decode()}")
    page_count = len(re.findall(rb"/Type\s*/Page\b", data))
    if exact_pages is not None and page_count != exact_pages:
        raise ValueError(f"pdf_page_count_mismatch:{path.name}:{page_count}")
    if page_count < minimum_pages:
        raise ValueError(f"pdf_page_count_below_minimum:{path.name}:{page_count}")
    if data.count(FIXED_DATE) < 2 or re.search(rb"D:\d{14}\+00'00'", data.replace(FIXED_DATE, b"")):
        raise ValueError(f"pdf_metadata_not_normalized:{path.name}")
    extracted = text(path)
    if primary:
        for pattern in PRIMARY_BANS:
            match = pattern.search(extracted)
            if match:
                raise ValueError(f"pdf_primary_surface_debris:{path.name}:{match.group(0)}")
    return page_count


def main() -> int:
    counts: dict[str, int] = {}
    for slug in ("atlasgrid", "helios"):
        for artifact, exact, minimum, primary in (
            ("ic-snapshot", 1, 1, True),
            ("underwriting-packet", None, 2, True),
            ("technical-appendix", None, 1, False),
        ):
            path = ROOT / "output" / "pdf" / f"{slug}-{artifact}-letter.pdf"
            counts[path.name] = verify(path, exact_pages=exact, minimum_pages=minimum, primary=primary)
    rendered = ",".join(f"{name}:{pages}" for name, pages in sorted(counts.items()))
    print(f"pdf-contract=PASS files=6 pages={rendered} tagged=6 normalized_metadata=6")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
