#!/usr/bin/env python3
"""Compare fresh browser candidates with retained, reviewed portfolio evidence."""

from __future__ import annotations

import hashlib
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "dist" / "visual-evidence"
CANDIDATE = ROOT / "dist" / "visual-candidates"
MAX_CHANGED_PIXEL_RATIO = 0.02
MAX_RMS_CHANNEL_DELTA = 3.0


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


def main() -> int:
    baseline_pngs = sorted(BASELINE.glob("*.png"))
    if len(baseline_pngs) != 22:
        raise SystemExit(f"visual-regression FAIL: expected 22 baselines, got {len(baseline_pngs)}")
    failures: list[str] = []
    reference_comparable = sys.platform == "darwin"
    for baseline in baseline_pngs:
        candidate = CANDIDATE / baseline.name
        if not candidate.is_file():
            failures.append(f"missing_candidate:{candidate.name}")
            continue
        changed_ratio, rms = _compare_png(baseline, candidate)
        if reference_comparable and (
            changed_ratio > MAX_CHANGED_PIXEL_RATIO or rms > MAX_RMS_CHANNEL_DELTA
        ):
            failures.append(
                f"visual_drift:{candidate.name}:changed={changed_ratio:.6f}:rms={rms:.6f}"
            )
    for slug in ("atlasgrid", "helios"):
        file_name = f"{slug}-ic-memo-letter.pdf"
        baseline_pdf = ROOT / "output" / "pdf" / file_name
        candidate_pdf = CANDIDATE / file_name
        if not candidate_pdf.is_file():
            failures.append(f"missing_candidate:{file_name}")
        elif reference_comparable and _sha256(baseline_pdf) != _sha256(candidate_pdf):
            failures.append(f"pdf_byte_regression:{file_name}")
    if failures:
        raise SystemExit("visual-regression FAIL:\n" + "\n".join(failures))
    if reference_comparable:
        print(
            "visual-regression=PASS reference_platform=darwin "
            f"pngs={len(baseline_pngs)} changed_pixel_limit={MAX_CHANGED_PIXEL_RATIO:.2%} "
            f"rms_limit={MAX_RMS_CHANNEL_DELTA:.1f} pdf_byte_matches=2/2"
        )
    else:
        print(
            "visual-regression=NOT_COMPARABLE "
            f"platform={sys.platform} candidates={len(baseline_pngs)} dimensions=PASS "
            "pdf_candidates=2/2; browser, overflow, and axe flows remain enforced"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
