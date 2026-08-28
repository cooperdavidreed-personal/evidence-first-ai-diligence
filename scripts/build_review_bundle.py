#!/usr/bin/env python3
"""Build a deterministic, review-ready source archive.

The archive intentionally contains the repository as one top-level directory so
it can be extracted and run without relocating package metadata or tests.
Local environments, generated evidence, caches, credentials, and private
mission-control artifacts are omitted.
"""

from __future__ import annotations

import argparse
import os
import stat
import tempfile
import zipfile
from collections.abc import Sequence
from pathlib import Path


ARCHIVE_TIMESTAMP = (1980, 1, 1, 0, 0, 0)

EXCLUDED_DIRECTORIES = frozenset(
    {
        ".git",
        ".venv",
        "dist",
        "evidence",
        "state",
        "__pycache__",
        ".pytest_cache",
        ".ruff_cache",
        ".mypy_cache",
        ".hypothesis",
        ".tox",
        ".nox",
        ".eggs",
        "build",
        "htmlcov",
        "node_modules",
        ".next",
        ".codex",
        ".claude",
        ".cursor",
        "orders",
        "receipts",
    }
)

EXCLUDED_FILES = frozenset(
    {
        ".coverage",
        ".DS_Store",
        ".npmrc",
        ".pypirc",
        "credentials.json",
        "mission.json",
        "mission.yaml",
        "mission.yml",
        "op-session.env",
        "service-account.json",
    }
)

EXCLUDED_SUFFIXES = (
    ".egg-info",
    ".key",
    ".pem",
    ".p12",
    ".pfx",
    ".pyc",
    ".pyo",
    ".sqlite",
    ".sqlite3",
    ".stderr",
    ".stdout",
)

SAFE_ENV_TEMPLATES = frozenset({".env.example", ".env.sample", ".env.template"})


def _excluded_file(path: Path) -> bool:
    name = path.name
    if name in EXCLUDED_FILES:
        return True
    if name == ".env" or (name.startswith(".env.") and name not in SAFE_ENV_TEMPLATES):
        return True
    if name.startswith("service-account") and name.endswith(".json"):
        return True
    return name.endswith(EXCLUDED_SUFFIXES)


def _source_files(root: Path, out: Path) -> list[Path]:
    files: list[Path] = []
    for current, directory_names, file_names in os.walk(root, followlinks=False):
        current_path = Path(current)
        directory_names[:] = sorted(
            name
            for name in directory_names
            if name not in EXCLUDED_DIRECTORIES
            and not name.endswith(".egg-info")
            and not (current_path / name).is_symlink()
        )
        for file_name in sorted(file_names):
            path = current_path / file_name
            if path.is_symlink() or _excluded_file(path):
                continue
            if path.resolve() == out:
                continue
            files.append(path)
    return sorted(files, key=lambda path: path.relative_to(root).as_posix())


def _zip_info(
    name: str, *, directory: bool, executable: bool = False
) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, ARCHIVE_TIMESTAMP)
    info.create_system = 3
    info.extra = b""
    info.comment = b""
    if directory:
        info.compress_type = zipfile.ZIP_STORED
        info.external_attr = (stat.S_IFDIR | 0o755) << 16 | 0x10
    else:
        mode = 0o755 if executable else 0o644
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (stat.S_IFREG | mode) << 16
    return info


def build_review_bundle(root: Path, out: Path) -> Path:
    """Write a deterministic source zip and return its resolved path."""

    root = root.expanduser().resolve(strict=True)
    out = out.expanduser().resolve()
    if not root.is_dir():
        raise NotADirectoryError(root)
    if out.suffix.lower() != ".zip":
        raise ValueError("--out must end in .zip")

    required = ("README.md", "pyproject.toml", "LICENSE", "NOTICE", "tests")
    missing = [name for name in required if not (root / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"repository is missing required review content: {', '.join(missing)}"
        )

    files = _source_files(root, out)
    prefix = root.name
    directories = {f"{prefix}/"}
    for path in files:
        parent = path.relative_to(root).parent
        while parent != Path("."):
            directories.add(f"{prefix}/{parent.as_posix()}/")
            parent = parent.parent

    out.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=out.parent, prefix=f".{out.name}.", suffix=".tmp", delete=False
        ) as handle:
            temporary = Path(handle.name)
        with zipfile.ZipFile(
            temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
        ) as archive:
            archived_files = {
                f"{prefix}/{path.relative_to(root).as_posix()}": path for path in files
            }
            for name in sorted(directories | archived_files.keys()):
                if name in directories:
                    archive.writestr(_zip_info(name, directory=True), b"")
                    continue
                path = archived_files[name]
                executable = bool(path.stat().st_mode & 0o111)
                archive.writestr(
                    _zip_info(name, directory=False, executable=executable),
                    path.read_bytes(),
                    compresslevel=9,
                )
        temporary.replace(out)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return out


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="repository root")
    parser.add_argument("--out", type=Path, required=True, help="output .zip path")
    args = parser.parse_args(argv)
    result = build_review_bundle(args.root, args.out)
    print(f"review-bundle={result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
