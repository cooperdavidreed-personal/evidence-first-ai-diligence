#!/usr/bin/env python3
"""Fail closed when prospective public source contains private paths or secrets."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAX_FILE_BYTES = 10 * 1024 * 1024
FORBIDDEN_PATH_PARTS = {"evidence", "state", ".venv", "dist", "__pycache__"}
PATTERNS = {
    "absolute-user-path": re.compile(rb"/(?:Users|home)/[^/\s]+/"),
    "aws-access-key": re.compile(b"AKIA" + rb"[0-9A-Z]{16}"),
    "private-key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "provider-api-key": re.compile(rb"(?:OPENAI|ANTHROPIC|XAI)_API_KEY\s*=\s*[^\s<]+"),
    "github-token": re.compile(rb"gh[pousr]_[A-Za-z0-9_]{30,}"),
    "pypi-token": re.compile(rb"pypi-[A-Za-z0-9_-]{30,}"),
}


def main() -> int:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    files = [item for item in result.stdout.split(b"\0") if item]
    if not files:
        raise SystemExit("public scan FAIL: git returned no candidate files")
    failures: list[str] = []
    for raw in files:
        relative = raw.decode("utf-8", errors="strict")
        path = ROOT / relative
        if FORBIDDEN_PATH_PARTS.intersection(Path(relative).parts):
            failures.append(f"{relative}: private or generated path")
            continue
        if path.is_symlink():
            failures.append(f"{relative}: symlink is not allowed")
            continue
        data = path.read_bytes()
        if len(data) > MAX_FILE_BYTES:
            failures.append(f"{relative}: file exceeds scan limit")
            continue
        if b"\0" in data[:8192]:
            failures.append(f"{relative}: binary file requires explicit review")
            continue
        for name, pattern in PATTERNS.items():
            if pattern.search(data):
                failures.append(f"{relative}: {name}")
    if failures:
        raise SystemExit("public scan FAIL:\n" + "\n".join(failures))
    print(f"public-scan=PASS candidate_files={len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
