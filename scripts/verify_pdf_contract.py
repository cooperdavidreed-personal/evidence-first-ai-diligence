#!/usr/bin/env python3
"""Fail closed on the retained IC memo PDF structure contract."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def verify(path: Path) -> None:
    data = path.read_bytes()
    if not data.startswith(b"%PDF-"):
        raise ValueError(f"pdf_header_invalid:{path.name}")
    if b"/Encrypt" in data:
        raise ValueError(f"pdf_encryption_forbidden:{path.name}")
    for marker in (b"/StructTreeRoot", b"/MarkInfo", b"/Marked true"):
        if marker not in data:
            raise ValueError(f"pdf_tagging_missing:{path.name}:{marker.decode()}")
    page_count = len(re.findall(rb"/Type\s*/Page\b", data))
    if page_count != 5:
        raise ValueError(f"pdf_page_count_mismatch:{path.name}:{page_count}")
    fixed = b"D:20260829000000+00'00'"
    if data.count(fixed) < 2 or re.search(rb"D:\d{14}\+00'00'", data.replace(fixed, b"")):
        raise ValueError(f"pdf_metadata_not_normalized:{path.name}")


def main() -> int:
    for slug in ("atlasgrid", "helios"):
        verify(ROOT / "output" / "pdf" / f"{slug}-ic-memo-letter.pdf")
    print("pdf-contract=PASS files=2 pages=10 tagged=2 normalized_metadata=2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
