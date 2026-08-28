from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import zipfile
from pathlib import Path


ARCHIVE_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
SCRIPT = Path(__file__).parents[1] / "scripts" / "build_review_bundle.py"


def _write(root: Path, relative: str, content: str = "fixture\n") -> Path:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def _fixture_repository(tmp_path: Path) -> Path:
    root = tmp_path / "reviewable-repo"
    for relative in (
        "README.md",
        "pyproject.toml",
        "LICENSE",
        "NOTICE",
        "tests/test_example.py",
        "src/ic_evidence_lab/__init__.py",
        "src/ic_evidence_lab/schemas/case.schema.json",
        "scripts/check.sh",
        ".github/workflows/ci.yml",
        ".env.example",
    ):
        _write(root, relative)
    (root / "scripts/check.sh").chmod(0o755)

    for relative in (
        ".git/config",
        ".venv/pyvenv.cfg",
        "dist/package.whl",
        "evidence/provider.stdout",
        "state/events.jsonl",
        "src/ic_evidence_lab/__pycache__/module.pyc",
        ".pytest_cache/CACHEDIR.TAG",
        ".ruff_cache/cache",
        ".mypy_cache/cache",
        "node_modules/package/index.js",
        "build/output.txt",
        "orders/claude.md",
        "receipts/private.json",
        ".codex/session.json",
        ".env",
        ".env.local",
        ".pypirc",
        "credentials.json",
        "mission.json",
        "private.pem",
        "run.stderr",
        ".DS_Store",
    ):
        _write(root, relative, "must-not-ship\n")
    return root


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _build(root: Path, out: Path) -> None:
    subprocess.run(
        [sys.executable, str(SCRIPT), "--root", str(root), "--out", str(out)],
        check=True,
        capture_output=True,
        text=True,
    )


def test_bundle_preserves_repo_root_and_excludes_private_generated_files(
    tmp_path: Path,
) -> None:
    root = _fixture_repository(tmp_path)
    out = tmp_path / "review.zip"

    _build(root, out)

    with zipfile.ZipFile(out) as archive:
        names = archive.namelist()
        files = {name for name in names if not name.endswith("/")}

        assert names == sorted(names)
        assert {name.split("/", 1)[0] for name in names} == {root.name}
        assert f"{root.name}/README.md" in files
        assert f"{root.name}/pyproject.toml" in files
        assert f"{root.name}/LICENSE" in files
        assert f"{root.name}/NOTICE" in files
        assert f"{root.name}/tests/test_example.py" in files
        assert f"{root.name}/src/ic_evidence_lab/schemas/case.schema.json" in files
        assert f"{root.name}/project/README.md" not in files
        assert f"{root.name}/.env.example" in files
        assert all("must-not-ship" not in archive.read(name).decode() for name in files)

        assert all(info.date_time == ARCHIVE_TIMESTAMP for info in archive.infolist())
        script = archive.getinfo(f"{root.name}/scripts/check.sh")
        readme = archive.getinfo(f"{root.name}/README.md")
        assert (script.external_attr >> 16) & 0o777 == 0o755
        assert (readme.external_attr >> 16) & 0o777 == 0o644


def test_bundle_is_byte_identical_across_builds(tmp_path: Path) -> None:
    root = _fixture_repository(tmp_path)
    first = tmp_path / "first.zip"
    second = tmp_path / "second.zip"

    _build(root, first)
    os.utime(root / "README.md", (2_000_000_000, 2_000_000_000))
    _build(root, second)

    assert first.read_bytes() == second.read_bytes()
    assert _sha256(first) == _sha256(second)
