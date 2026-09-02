from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image


DEMO_SOURCE = Path("demo/final")
VIDEO_NAME = "underwriting-desk-demo-1080p.mp4"
EXPECTED_REVIEWERS = {"CLAUDE", "CHATGPT", "GROK"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode()


def normalized_text(value: str) -> str:
    return " ".join(value.split())


def timestamp_seconds(value: str) -> float:
    hours, minutes, seconds = value.replace(",", ".").split(":")
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def parse_caption_file(path: Path) -> list[dict[str, Any]]:
    blocks = re.split(r"\n\s*\n", path.read_text(encoding="utf-8").strip())
    cues: list[dict[str, Any]] = []
    for block in blocks:
        lines = [line.rstrip() for line in block.splitlines() if line.strip()]
        if not lines or lines == ["WEBVTT"]:
            continue
        if lines[0].isdigit():
            lines = lines[1:]
        require(lines and " --> " in lines[0], f"caption timing missing: {path}")
        start, end = lines[0].split(" --> ", 1)
        text_lines = lines[1:]
        require(1 <= len(text_lines) <= 2, f"caption cue must use one or two lines: {path}")
        require(
            all(len(line) <= 64 for line in text_lines),
            f"caption line exceeds 64 characters: {path}",
        )
        cues.append(
            {
                "start": timestamp_seconds(start),
                "end": timestamp_seconds(end),
                "lines": text_lines,
            }
        )
    require(cues, f"no caption cues found: {path}")
    return cues


def verify_captions(source: Path, transcript: str, target: int) -> dict[str, int]:
    observed: dict[str, int] = {}
    for name in ("captions.srt", "captions.vtt"):
        cues = parse_caption_file(source / name)
        require(abs(cues[0]["start"]) <= 0.001, f"{name} does not start at zero")
        require(abs(cues[-1]["end"] - target) <= 0.001, f"{name} does not end at target")
        for current, following in zip(cues, cues[1:]):
            require(current["start"] < current["end"], f"{name} has an empty cue")
            require(
                abs(current["end"] - following["start"]) <= 0.001,
                f"{name} cues are not contiguous",
            )
        caption_text = " ".join(" ".join(cue["lines"]) for cue in cues)
        require(
            normalized_text(caption_text) == normalized_text(transcript),
            f"{name} text differs from transcript",
        )
        observed[name] = len(cues)
    return observed


def verify_storyboard(source: Path) -> tuple[dict[str, Any], str, dict[str, int]]:
    storyboard = json.loads((source / "storyboard.json").read_text(encoding="utf-8"))
    require(
        storyboard.get("schema_version") == "underwriting.demo-storyboard/v3",
        "storyboard schema mismatch",
    )
    lower, upper = storyboard["allowed_duration_seconds"]
    target = int(storyboard["target_duration_seconds"])
    require(75 <= lower <= target <= upper <= 90, "storyboard duration contract invalid")
    scenes = storyboard["scenes"]
    require(scenes[0]["start"] == 0 and scenes[-1]["end"] == target, "scene bounds invalid")
    require(len({scene["id"] for scene in scenes}) == len(scenes), "scene IDs are not unique")
    for current, following in zip(scenes, scenes[1:]):
        require(current["end"] == following["start"], "storyboard scenes are not contiguous")
    transcript = (source / "transcript.txt").read_text(encoding="utf-8")
    require(
        normalized_text(" ".join(scene["narration"] for scene in scenes))
        == normalized_text(transcript),
        "storyboard narration differs from transcript",
    )
    word_count = len(normalized_text(transcript).split())
    require(190 <= word_count <= 225, f"transcript word count outside 190–225: {word_count}")
    caption_counts = verify_captions(source, transcript, target)
    return storyboard, transcript, caption_counts


def probe_media(video: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            (
                "format=duration:stream=index,codec_type,codec_name,width,height,"
                "pix_fmt,avg_frame_rate,sample_rate,channels"
            ),
            "-of",
            "json",
            str(video),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def loudness(video: Path) -> tuple[float, float]:
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(video),
            "-map",
            "0:a:0",
            "-af",
            "loudnorm=I=-16:TP=-1:LRA=7:print_format=json",
            "-f",
            "null",
            "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    matches = re.findall(r'\{\s*"input_i".*?\}', result.stderr, flags=re.DOTALL)
    require(bool(matches), "loudness analysis did not return JSON")
    analysis = json.loads(matches[-1])
    return float(analysis["input_i"]), float(analysis["input_tp"])


def verify_source_closure(repo: Path, manifest: dict[str, Any]) -> int:
    source_commit = manifest.get("source_commit", "")
    require(bool(re.fullmatch(r"[0-9a-f]{40}", source_commit)), "source commit is invalid")
    require(
        subprocess.run(
            ["git", "cat-file", "-e", f"{source_commit}^{{commit}}"], cwd=repo
        ).returncode
        == 0,
        "source commit is unavailable",
    )
    tree = subprocess.run(
        ["git", "rev-parse", f"{source_commit}^{{tree}}"],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    require(manifest.get("source_tree_oid") == tree, "source tree binding mismatch")
    closure = manifest.get("source_closure")
    require(isinstance(closure, list) and closure, "source closure is empty")
    require(
        manifest.get("source_closure_sha256")
        == hashlib.sha256(canonical_bytes(closure)).hexdigest(),
        "source closure digest mismatch",
    )
    observed: list[str] = []
    for item in closure:
        require(
            isinstance(item, dict) and set(item) == {"path", "sha256"},
            "source closure entry shape invalid",
        )
        relative = Path(item["path"])
        require(not relative.is_absolute() and ".." not in relative.parts, "unsafe source path")
        require(relative.as_posix() not in observed, "duplicate source path")
        observed.append(relative.as_posix())
        committed = subprocess.run(
            ["git", "show", f"{source_commit}:{relative.as_posix()}"],
            cwd=repo,
            check=True,
            capture_output=True,
        ).stdout
        require(hashlib.sha256(committed).hexdigest() == item["sha256"], f"source commit mismatch: {relative}")
        require((repo / relative).is_file() and not (repo / relative).is_symlink(), f"source missing: {relative}")
        require(sha256(repo / relative) == item["sha256"], f"source changed after capture: {relative}")
    require(observed == sorted(observed), "source closure is not sorted")
    for required in (
        "demo/final/storyboard.json",
        "demo/final/transcript.txt",
        "output/pdf/atlasgrid-underwriting-packet-letter.pdf",
        "output/pdf/helios-underwriting-packet-letter.pdf",
        "workbench/api/challenge.ts",
        "workbench/src/data/cases.json",
        "workbench/vercel.json",
    ):
        require(required in observed, f"required source omitted: {required}")
    return len(observed)


def verify_bound_file(root: Path, record: dict[str, Any], *, name_key: str = "file") -> Path:
    relative = Path(record[name_key])
    require(not relative.is_absolute() and ".." not in relative.parts, "unsafe artifact path")
    path = root / relative
    require(path.is_file() and not path.is_symlink(), f"artifact missing: {relative}")
    require(sha256(path) == record["sha256"], f"artifact digest mismatch: {relative}")
    if "bytes" in record:
        require(path.stat().st_size == record["bytes"], f"artifact byte count mismatch: {relative}")
    return path


def verify_reviews(root: Path, manifest: dict[str, Any]) -> dict[str, int]:
    reviews_dir = root / "reviews"
    require(reviews_dir.is_dir(), "reviews directory missing")
    observed: set[str] = set()
    findings = 0
    for path in sorted(reviews_dir.glob("*.json")):
        review = json.loads(path.read_text(encoding="utf-8"))
        require(review.get("schema_version") == "underwriting.demo-review/v1", f"review schema mismatch: {path.name}")
        reviewer = review.get("reviewer")
        require(reviewer in EXPECTED_REVIEWERS and reviewer not in observed, f"reviewer invalid or duplicate: {reviewer}")
        observed.add(reviewer)
        require(review.get("source_commit") == manifest["source_commit"], f"review commit mismatch: {reviewer}")
        require(review.get("video_sha256") == manifest["sha256"], f"review video mismatch: {reviewer}")
        require(review.get("verdict") == "PASS", f"review did not pass: {reviewer}")
        require(
            review.get("media_review_mode") in {"VIDEO_AND_AUDIO", "VIDEO_PLUS_TRANSCRIPT"},
            f"reviewer did not inspect the final film: {reviewer}",
        )
        for finding in review.get("findings", []):
            require(
                {"severity", "timestamp_seconds", "finding", "evidence", "recommended_change"}
                <= set(finding),
                f"review finding incomplete: {reviewer}",
            )
            require(finding["severity"] in {"MEDIUM", "LOW"}, f"blocking review finding: {reviewer}")
            findings += 1
    require(observed == EXPECTED_REVIEWERS, f"required reviewers missing: {sorted(EXPECTED_REVIEWERS - observed)}")
    return {"reviewers": len(observed), "findings": findings}


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the final narrated portfolio demonstration")
    parser.add_argument("--root", default="dist/release-demo")
    parser.add_argument("--require-reviews", action="store_true")
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    root = (repo / args.root).resolve()
    source = repo / DEMO_SOURCE
    require(root.is_dir() and not root.is_symlink(), "demo root missing or unsafe")
    storyboard, transcript, caption_counts = verify_storyboard(source)
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_body = dict(manifest)
    manifest_digest = manifest_body.pop("manifest_sha256", None)
    require(
        manifest_digest == hashlib.sha256(canonical_bytes(manifest_body)).hexdigest(),
        "demo manifest digest mismatch",
    )
    require(manifest.get("schema_version") == "underwriting.demo-manifest/v3", "demo manifest schema mismatch")
    require(manifest.get("status") == "RENDERED_PENDING_INDEPENDENT_REVIEW", "demo manifest status mismatch")
    require(manifest.get("capture") == "REAL_PUBLIC_WORKBENCH_INTERACTIONS", "demo capture mode mismatch")
    require(manifest.get("deployed_url") == "https://underwriting-desk-delta.vercel.app/", "demo deployed URL mismatch")

    video = root / VIDEO_NAME
    require(video.is_file() and not video.is_symlink(), "demo video missing or unsafe")
    require(manifest.get("video") == VIDEO_NAME, "demo video name mismatch")
    require(manifest.get("sha256") == sha256(video), "demo video digest mismatch")
    media = probe_media(video)
    duration = float(media["format"]["duration"])
    lower, upper = storyboard["allowed_duration_seconds"]
    require(lower <= duration <= upper, f"duration outside 75–90 second contract: {duration}")
    require(abs(duration - storyboard["target_duration_seconds"]) <= 0.1, "duration differs from target")
    video_streams = [item for item in media["streams"] if item["codec_type"] == "video"]
    audio_streams = [item for item in media["streams"] if item["codec_type"] == "audio"]
    require(len(video_streams) == 1 and len(audio_streams) == 1, "expected one video and one audio stream")
    video_stream = video_streams[0]
    audio_stream = audio_streams[0]
    require(video_stream["codec_name"] == "h264", "video codec is not H.264")
    require((video_stream["width"], video_stream["height"]) == (1920, 1080), "video is not 1080p")
    require(video_stream["pix_fmt"] == "yuv420p", "video pixel format is not yuv420p")
    require(video_stream["avg_frame_rate"] == "30/1", "video is not 30 fps")
    require(audio_stream["codec_name"] == "aac", "audio codec is not AAC")
    require(audio_stream["sample_rate"] == "48000", "audio is not 48 kHz")
    require(audio_stream["channels"] == 1, "audio is not mono")
    integrated_lufs, true_peak = loudness(video)
    require(-17.5 <= integrated_lufs <= -14.5, f"integrated loudness outside tolerance: {integrated_lufs}")
    require(true_peak <= -0.5, f"true peak exceeds tolerance: {true_peak}")

    for name in ("captions.srt", "captions.vtt", "transcript.txt", "storyboard.json"):
        require((root / name).read_bytes() == (source / name).read_bytes(), f"rendered source copy mismatch: {name}")
    require(normalized_text((root / "transcript.txt").read_text()) == normalized_text(transcript), "transcript copy mismatch")
    for name, record in manifest["captions"].items():
        verify_bound_file(root, {"file": name, **record})
    verify_bound_file(root, manifest["transcript"])

    narration = verify_bound_file(root, manifest["audio"])
    tts_receipt_path = verify_bound_file(
        root,
        {"file": manifest["tts"]["receipt"], "sha256": manifest["tts"]["receipt_sha256"]},
    )
    tts_receipt = json.loads(tts_receipt_path.read_text(encoding="utf-8"))
    require(tts_receipt.get("tts_provider") == "elevenlabs", "narration is not ElevenLabs")
    require(tts_receipt.get("publishable") is True, "narration is not publishable")
    require(tts_receipt.get("output_sha256") == sha256(narration), "TTS receipt audio digest mismatch")
    for key in ("tts_voice_id", "tts_voice_name", "tts_model_id", "tts_billed_characters", "tts_request_id"):
        require(manifest["tts"].get(key) == tts_receipt.get(key), f"manifest TTS field mismatch: {key}")

    thumbnail = verify_bound_file(root, manifest["thumbnail"])
    with Image.open(thumbnail) as image:
        require(image.size == (1280, 720), "thumbnail resolution mismatch")
        require(image.convert("L").getextrema()[0] != image.convert("L").getextrema()[1], "thumbnail is blank")

    expected_frames = storyboard["expected_review_frames"]
    frame_records = manifest["review_frames"]
    require([Path(item["path"]).name for item in frame_records] == expected_frames, "review-frame order mismatch")
    for record in frame_records:
        frame = verify_bound_file(root, record, name_key="path")
        with Image.open(frame) as image:
            require(image.size == (1920, 1080), f"review frame resolution mismatch: {frame.name}")
            require(image.convert("L").getextrema()[0] != image.convert("L").getextrema()[1], f"review frame blank: {frame.name}")

    capture_receipt = verify_bound_file(root, manifest["capture_receipt"])
    capture = json.loads(capture_receipt.read_text(encoding="utf-8"))
    require(capture.get("schema_version") == "underwriting.demo-capture-receipt/v2", "capture receipt schema mismatch")
    require(capture.get("required_test_ids") == storyboard["required_test_ids"], "capture selector contract mismatch")
    require([item["filename"] for item in capture["frames"]] == expected_frames, "capture frame sequence mismatch")
    claims = {item["text"] for item in capture["observed_claims"]}
    require(set(storyboard["required_visible_claims"]) <= claims, "required visual claims were not observed")

    for record in manifest["pdfs"]:
        pdf = repo / record["path"]
        require(pdf.is_file() and not pdf.is_symlink(), f"bound PDF missing: {record['path']}")
        require(sha256(pdf) == record["sha256"], f"bound PDF digest mismatch: {record['path']}")
        require(pdf.stat().st_size == record["bytes"], f"bound PDF byte count mismatch: {record['path']}")
    source_file_count = verify_source_closure(repo, manifest)
    review_summary = verify_reviews(root, manifest) if args.require_reviews else {"reviewers": 0, "findings": 0}

    print(
        json.dumps(
            {
                "audio": "ELEVENLABS_AAC_48KHZ_MONO",
                "caption_cues": caption_counts,
                "duration_seconds": duration,
                "fps": video_stream["avg_frame_rate"],
                "integrated_lufs": integrated_lufs,
                "resolution": f"{video_stream['width']}x{video_stream['height']}",
                "review_frames": len(frame_records),
                "reviews": review_summary,
                "sha256": manifest["sha256"],
                "source_files": source_file_count,
                "status": "PASS",
                "true_peak_dbtp": true_peak,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
