from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from ic_evidence_lab.canonical import canonical_json
from scripts.build_pages import build


def _candidate_repo(root: Path) -> Path:
    repo = root / "candidate-repo"
    for case in ("atlasgrid", "helios"):
        case_root = repo / "portfolio" / case
        case_root.mkdir(parents=True)
        for name in ("ic-memo.html", "ic-memo.md", "model-appendix.json", "packet-receipt.json"):
            (case_root / name).write_text(f"{case}:{name}")
        room = case_root / "data-room"
        (room / "data").mkdir(parents=True)
        source = room / "data" / "source.csv"
        source.write_text("id,value\n1,synthetic\n")
        source_sha256 = hashlib.sha256(source.read_bytes()).hexdigest()
        source_manifest = {
            "synthetic": True,
            "artifacts": [
                {"path": "data/source.csv", "sha256": source_sha256}
            ],
        }
        (room / "manifest.json").write_text(json.dumps(source_manifest))
    accessibility_root = repo / "verification" / "accessibility-evidence"
    accessibility_root.mkdir(parents=True)
    for name in ("desktop-atlasgrid.json", "mobile-atlasgrid.json", "desktop-helios.json", "mobile-helios.json"):
        (accessibility_root / name).write_text('{"status":"PASS"}\n')
    png = repo / "dist/visual-evidence/proof.png"
    pdf = repo / "output/pdf/memo.pdf"
    png.parent.mkdir(parents=True)
    pdf.parent.mkdir(parents=True)
    png.write_bytes(b"reviewed-png")
    pdf.write_bytes(b"reviewed-pdf")
    manifest = {
        "schema_version": "underwriting.visual-evidence/v1",
        "files": [
            {
                "path": "dist/visual-evidence/proof.png",
                "viewport": "1x1",
                "bytes": png.stat().st_size,
                "sha256": hashlib.sha256(png.read_bytes()).hexdigest(),
            }
        ],
        "print_files": [
            {
                "path": "output/pdf/memo.pdf",
                "format": "test PDF",
                "bytes": pdf.stat().st_size,
                "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
            }
        ],
        "scope": "test",
    }
    manifest["manifest_sha256"] = hashlib.sha256(canonical_json(manifest)).hexdigest()
    manifest_path = repo / "verification/visual-evidence.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_bytes(canonical_json(manifest) + b"\n")
    return repo


def test_pages_stage_v2_workbench_and_bound_candidate_artifacts(tmp_path: Path) -> None:
    repo = _candidate_repo(tmp_path)
    workbench = tmp_path / "built-workbench"
    workbench.mkdir()
    (workbench / "index.html").write_text("<h1>V2 portfolio workbench</h1>")
    (workbench / "assets").mkdir()
    (workbench / "assets/app.js").write_text("console.log('v2')")
    destination = tmp_path / "pages"

    build(repo, destination, workbench)

    assert (destination / "index.html").read_text() == "<h1>V2 portfolio workbench</h1>"
    assert (destination / "assets/app.js").is_file()
    for case in ("atlasgrid", "helios"):
        for name in ("ic-memo.html", "ic-memo.md", "model-appendix.json", "packet-receipt.json"):
            assert (destination / "portfolio" / case / name).is_file()
        assert (destination / "source-pack" / case / "manifest.json").is_file()
        assert (destination / "source-pack" / case / "data" / "source.csv").is_file()
    assert (destination / "verification/visual-evidence.json").is_file()
    assert (destination / "output/pdf/memo.pdf").is_file()
    assert not (destination / "demo").exists()

    manifest = json.loads((destination / "candidate-artifacts.json").read_text())
    assert manifest["schema_version"] == "underwriting.portfolio-candidate/v2"
    roles = {entry["role"] for entry in manifest["artifacts"]}
    assert {"v2-workbench", "case-packet", "synthetic-data-room", "accessibility-evidence", "visual-manifest", "visual-evidence", "print-pdf"} <= roles
    for entry in manifest["artifacts"]:
        artifact = destination / entry["path"]
        assert artifact.stat().st_size == entry["bytes"]
        assert hashlib.sha256(artifact.read_bytes()).hexdigest() == entry["sha256"]


def test_pages_refuse_stale_destination(tmp_path: Path) -> None:
    repo = _candidate_repo(tmp_path)
    workbench = tmp_path / "built-workbench"
    workbench.mkdir()
    (workbench / "index.html").write_text("v2")
    destination = tmp_path / "pages"
    destination.mkdir()
    (destination / "stale.txt").write_text("stale")
    with pytest.raises(RuntimeError, match="must be empty"):
        build(repo, destination, workbench)


def test_pages_reject_unsafe_visual_manifest_path(tmp_path: Path) -> None:
    repo = _candidate_repo(tmp_path)
    manifest_path = repo / "verification/visual-evidence.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["files"][0]["path"] = "../outside.png"
    manifest.pop("manifest_sha256")
    manifest["manifest_sha256"] = hashlib.sha256(canonical_json(manifest)).hexdigest()
    manifest_path.write_bytes(canonical_json(manifest) + b"\n")
    workbench = tmp_path / "built-workbench"
    workbench.mkdir()
    (workbench / "index.html").write_text("v2")
    with pytest.raises(ValueError, match="unsafe candidate artifact path"):
        build(repo, tmp_path / "pages", workbench)
