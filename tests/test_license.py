from __future__ import annotations

import tomllib
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_apache_license_and_package_metadata_agree() -> None:
    metadata = tomllib.loads((ROOT / "pyproject.toml").read_text())
    license_text = (ROOT / "LICENSE").read_text()

    assert metadata["project"]["license"] == "Apache-2.0"
    assert metadata["project"]["version"] == "0.2.0"
    assert metadata["project"]["license-files"] == ["LICENSE", "NOTICE"]
    assert "Apache License" in license_text
    assert "Version 2.0, January 2004" in license_text
    assert (ROOT / "NOTICE").is_file()
    assert not (ROOT / "LICENSE-PENDING.md").exists()
