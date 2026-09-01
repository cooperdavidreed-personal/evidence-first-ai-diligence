#!/usr/bin/env python3
"""Compare fresh browser candidates with retained, reviewed portfolio evidence."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "dist" / "visual-evidence"
CANDIDATE = ROOT / "dist" / "visual-candidates"
ACCESSIBILITY_BASELINE = ROOT / "verification" / "accessibility-evidence"
ACCESSIBILITY_CANDIDATE = ROOT / "dist" / "accessibility-candidates"
MAX_CHANGED_PIXEL_RATIO = 0.02
MAX_RMS_CHANNEL_DELTA = 3.0
MAX_LOCALIZED_FOCUS_DRIFT_RATIO = 0.001
MAX_STRUCTURAL_SCREENSHOT_HEIGHT = 20_000


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _compare_png(baseline: Path, candidate: Path) -> tuple[float, float]:
    with Image.open(baseline).convert("RGB") as expected:
        with Image.open(candidate).convert("RGB") as actual:
            if expected.size != actual.size:
                raise ValueError(
                    f"visual_dimensions_mismatch:{candidate.name}:{expected.size}:{actual.size}"
                )
            difference = ImageChops.difference(expected, actual)
            histogram = difference.convert("L").point(lambda value: 255 if value > 12 else 0)
            changed_pixels = sum(histogram.histogram()[1:]) / 255
            total_pixels = expected.width * expected.height
            changed_ratio = changed_pixels / total_pixels
            rms = max(ImageStat.Stat(difference).rms)
            return changed_ratio, rms


def _verify_cross_platform_dimensions(candidate: Path) -> None:
    """Validate capture geometry without pretending Linux pixels equal macOS pixels."""
    expected_width, minimum_height = (
        (1440, 900) if candidate.name.startswith("desktop-") else (390, 844)
    )
    with Image.open(candidate) as actual:
        actual.verify()
        width, height = actual.size
    if width != expected_width or not minimum_height <= height <= MAX_STRUCTURAL_SCREENSHOT_HEIGHT:
        raise ValueError(
            f"visual_capture_geometry_invalid:{candidate.name}:"
            f"expected_width={expected_width}:minimum_height={minimum_height}:actual={(width, height)}"
        )


def main() -> int:
    manifest = json.loads((ROOT / "verification" / "visual-evidence.json").read_text())
    manifest_paths = [entry["path"] for entry in [*manifest["files"], *manifest["print_files"]] if entry["path"].endswith(".png")]
    baseline_pngs = [ROOT / relative for relative in manifest_paths]
    if len(baseline_pngs) != 32:
        raise SystemExit(f"visual-regression FAIL: expected 32 manifest-bound baselines, got {len(baseline_pngs)}")
    failures: list[str] = []
    reference_comparable = sys.platform == "darwin"
    for baseline in baseline_pngs:
        candidate = CANDIDATE / baseline.name
        if not candidate.is_file():
            failures.append(f"missing_candidate:{candidate.name}")
            continue
        try:
            if reference_comparable:
                changed_ratio, rms = _compare_png(baseline, candidate)
                if changed_ratio > MAX_CHANGED_PIXEL_RATIO or (
                    rms > MAX_RMS_CHANNEL_DELTA
                    and changed_ratio > MAX_LOCALIZED_FOCUS_DRIFT_RATIO
                ):
                    failures.append(
                        f"visual_drift:{candidate.name}:changed={changed_ratio:.6f}:rms={rms:.6f}"
                    )
            else:
                _verify_cross_platform_dimensions(candidate)
        except (OSError, ValueError) as error:
            failures.append(str(error))
    pdf_matches = 0
    for slug in ("atlasgrid", "helios"):
        for artifact in ("ic-snapshot", "underwriting-packet", "technical-appendix"):
            file_name = f"{slug}-{artifact}-letter.pdf"
            baseline_pdf = ROOT / "output" / "pdf" / file_name
            candidate_pdf = CANDIDATE / file_name
            if not candidate_pdf.is_file():
                failures.append(f"missing_candidate:{file_name}")
            elif reference_comparable and _sha256(baseline_pdf) != _sha256(candidate_pdf):
                failures.append(f"pdf_byte_regression:{file_name}")
            else:
                pdf_matches += 1
    accessibility_baselines = sorted(ACCESSIBILITY_BASELINE.glob("*.json"))
    if len(accessibility_baselines) != 4:
        failures.append(
            f"accessibility_baseline_count:{len(accessibility_baselines)}"
        )
    for baseline in accessibility_baselines:
        candidate = ACCESSIBILITY_CANDIDATE / baseline.name
        if not candidate.is_file():
            failures.append(f"missing_accessibility_candidate:{baseline.name}")
        elif baseline.read_bytes() != candidate.read_bytes():
            failures.append(f"accessibility_evidence_drift:{baseline.name}")
    if failures:
        raise SystemExit("visual-regression FAIL:\n" + "\n".join(failures))
    if reference_comparable:
        print(
            "visual-regression=PASS reference_platform=darwin "
            f"pngs={len(baseline_pngs)} changed_pixel_limit={MAX_CHANGED_PIXEL_RATIO:.2%} "
            f"rms_limit={MAX_RMS_CHANNEL_DELTA:.1f} localized_focus_limit={MAX_LOCALIZED_FOCUS_DRIFT_RATIO:.2%} pdf_byte_matches={pdf_matches}/6"
            f" accessibility_matches={len(accessibility_baselines)}/4"
        )
    else:
        print(
            "visual-regression=NOT_COMPARABLE "
            f"platform={sys.platform} candidates={len(baseline_pngs)} dimensions=PASS "
            f"pdf_candidates={pdf_matches}/6; browser, overflow, and axe flows remain enforced"
            f" accessibility_matches={len(accessibility_baselines)}/4"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
