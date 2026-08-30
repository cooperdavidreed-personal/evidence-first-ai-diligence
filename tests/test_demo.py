from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_demo_storyboard_is_contiguous_source_bound_and_captioned() -> None:
    storyboard = json.loads((ROOT / "demo/storyboard.json").read_text())
    scenes = storyboard["scenes"]
    assert storyboard["status"] == "PORTFOLIO_CANDIDATE_FOUNDER_REVIEW_PENDING"
    assert storyboard["capture"] == "REAL_LOCAL_WORKBENCH_INTERACTIONS"
    assert scenes[0]["start"] == 0
    assert scenes[-1]["end"] == storyboard["target_duration_seconds"]
    assert (
        storyboard["allowed_duration_seconds"][0]
        <= scenes[-1]["end"]
        <= storyboard["allowed_duration_seconds"][1]
    )
    for current, following in zip(scenes, scenes[1:]):
        assert current["end"] == following["start"]
    for scene in scenes:
        assert scene["start"] < scene["end"]
        assert (ROOT / scene["source"]).is_file()
        assert scene["caption"] in (ROOT / "demo/captions.srt").read_text()
        assert scene["caption"] in (ROOT / "demo/captions.vtt").read_text()


def test_demo_covers_investor_judgment_lineage_scenarios_and_action() -> None:
    combined = " ".join(
        value
        for scene in json.loads((ROOT / "demo/storyboard.json").read_text())["scenes"]
        for value in (scene["eyebrow"], scene["title"], scene["body"], scene["proof"])
    )
    for required in (
        "DECISION FIRST",
        "HOLD",
        "NUMBER TO SOURCE",
        "ECONOMETRIC CONSEQUENCE",
        "RECOMPUTED SCENARIOS",
        "EVENT-BASED VENTURE",
        "UNDERWRITING TO OWNERSHIP",
    ):
        assert required.lower() in combined.lower()
