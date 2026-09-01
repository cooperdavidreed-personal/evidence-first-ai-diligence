from __future__ import annotations

import json
from pathlib import Path

from scripts.verify_demo import normalized_text, verify_storyboard


ROOT = Path(__file__).parents[1]
SOURCE = ROOT / "demo" / "release-fix"


def test_release_storyboard_is_current_contiguous_and_source_bound() -> None:
    storyboard, transcript, caption_counts = verify_storyboard(SOURCE)
    assert storyboard["status"] == "SOURCE_TEMPLATE_READY_RENDER_NOT_RUN"
    assert storyboard["capture"] == "REAL_LOCAL_WORKBENCH_INTERACTIONS"
    assert storyboard["resolution"] == "1920x1080"
    assert storyboard["fps"] == 30
    assert storyboard["target_duration_seconds"] == 86
    assert storyboard["allowed_duration_seconds"] == [75, 90]
    assert len(storyboard["scenes"]) == 8
    assert len(storyboard["expected_review_frames"]) == 12
    assert set(storyboard["selector_expectations"]) == set(storyboard["required_test_ids"])
    assert caption_counts == {"captions.srt": 21, "captions.vtt": 21}
    assert len(normalized_text(transcript).split()) == 210


def test_release_storyboard_covers_decision_exports_controls_and_boundaries() -> None:
    storyboard = json.loads((SOURCE / "storyboard.json").read_text())
    combined = normalized_text(json.dumps(storyboard, ensure_ascii=False)).lower()
    for required in (
        "synthetic",
        "reprice",
        "$210m",
        "23.3%",
        "partner-grade packet",
        "hold",
        "20%",
        "10%",
        "human authority",
    ):
        assert required in combined
    assert "enterprise-grade" not in combined
    assert "autonomous investment" not in combined


def test_capture_script_uses_current_routes_and_declared_stable_controls() -> None:
    script = (ROOT / "workbench" / "scripts" / "render-demo.mjs").read_text()
    storyboard = json.loads((SOURCE / "storyboard.json").read_text())
    for route in ("01 Overview", "02 Financials", "04 Memo"):
        assert route in script
    for test_id in storyboard["required_test_ids"]:
        assert f'requireTestId("{test_id}")' in script
    for retired in (
        "IC Snapshot",
        "Thesis & Evidence",
        "Econometric Lab",
        "Underwriting Room",
        "Value Creation",
    ):
        assert retired not in script
    assert "1440" not in script
    assert "1920" in script and "1080" in script
    assert "REAL_LOCAL_WORKBENCH_INTERACTIONS" in script
    assert "capture-receipt.json" in script


def test_render_pipeline_requires_governed_elevenlabs_audio_and_builds_aac() -> None:
    renderer = (ROOT / "scripts" / "render_demo.py").read_text()
    verifier = (ROOT / "scripts" / "verify_demo.py").read_text()
    for required in (
        '"tts_provider": "elevenlabs"',
        '"publishable": True',
        '"tts_billed_characters"',
        '"tts_request_id"',
        '"-c:a"',
        '"aac"',
        '"48000"',
        "WIDTH = 1920",
        "HEIGHT = 1080",
        '"RENDERED_PENDING_INDEPENDENT_REVIEW"',
    ):
        assert required in renderer
    assert 'audio_stream["codec_name"] == "aac"' in verifier
    assert 'EXPECTED_REVIEWERS = {"CLAUDE", "CHATGPT", "GROK"}' in verifier
    assert "Any unresolved CRITICAL or HIGH finding forces QUALITY_SHORT." in (
        SOURCE / "review-protocol.json"
    ).read_text()


def test_thumbnail_spec_uses_real_frame_and_bounded_claims() -> None:
    spec = json.loads((SOURCE / "thumbnail-spec.json").read_text())
    assert (spec["width"], spec["height"]) == (1280, 720)
    assert spec["source_frame"] == "01-atlasgrid-decision.png"
    assert spec["headline"] == "Evidence to decision"
    assert "REPRICE" in spec["case_line"] and "HOLD" in spec["case_line"]
    assert all("enterprise" not in value.lower() for value in spec.values() if isinstance(value, str))
