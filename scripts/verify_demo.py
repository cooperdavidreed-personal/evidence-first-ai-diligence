from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any


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
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the rendered portfolio demonstration")
    parser.add_argument("--root", default="dist/demo")
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    root = repo / args.root
    video = root / "underwriting-intelligence-lab-demo.mp4"
    manifest = json.loads((root / "manifest.json").read_text())
    storyboard = json.loads((repo / "demo/storyboard.json").read_text())
    lower, upper = storyboard["allowed_duration_seconds"]

    probe = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate",
            "-of", "json", str(video),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    media = json.loads(probe.stdout)
    duration = float(media["format"]["duration"])
    video_streams = [stream for stream in media["streams"] if stream["codec_type"] == "video"]
    audio_streams = [stream for stream in media["streams"] if stream["codec_type"] == "audio"]

    require(lower <= duration <= upper, f"duration outside declared range: {duration}")
    require(
        abs(duration - storyboard["target_duration_seconds"]) <= 0.1,
        f"duration differs from target: {duration}",
    )
    require(len(video_streams) == 1, f"expected one video stream, found {len(video_streams)}")
    require(audio_streams == [], f"unexpected audio streams: {len(audio_streams)}")
    stream = video_streams[0]
    require(stream["codec_name"] == "h264", f"unexpected codec: {stream['codec_name']}")
    require((stream["width"], stream["height"]) == (1440, 900), "unexpected resolution")
    require(stream["pix_fmt"] == "yuv420p", f"unexpected pixel format: {stream['pix_fmt']}")
    require(stream["avg_frame_rate"] == "30/1", f"unexpected frame rate: {stream['avg_frame_rate']}")
    require(manifest["sha256"] == sha256(video), "video digest does not match manifest")
    manifest_body = dict(manifest)
    manifest_sha256 = manifest_body.pop("manifest_sha256", None)
    require(manifest_sha256 == hashlib.sha256(canonical_bytes(manifest_body)).hexdigest(), "demo manifest digest mismatch")
    source_commit = manifest.get("source_commit", "")
    require(bool(re.fullmatch(r"[0-9a-f]{40}", source_commit)), "source commit is invalid")
    require(subprocess.run(["git", "cat-file", "-e", f"{source_commit}^{{commit}}"], cwd=repo).returncode == 0, "source commit is unavailable")
    source_tree_oid = subprocess.run(["git", "rev-parse", f"{source_commit}^{{tree}}"], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()
    require(manifest.get("source_tree_oid") == source_tree_oid, "source tree binding mismatch")
    closure = manifest.get("source_closure")
    require(isinstance(closure, list) and closure, "source closure is empty")
    require(manifest.get("source_closure_sha256") == hashlib.sha256(canonical_bytes(closure)).hexdigest(), "source closure digest mismatch")
    observed_paths: list[str] = []
    for item in closure:
        require(isinstance(item, dict) and set(item) == {"path", "sha256"}, "source closure entry shape invalid")
        relative = Path(item["path"])
        require(not relative.is_absolute() and ".." not in relative.parts, "source closure path unsafe")
        require(relative.as_posix() not in observed_paths, "source closure path duplicate")
        observed_paths.append(relative.as_posix())
        committed = subprocess.run(["git", "show", f"{source_commit}:{relative.as_posix()}"], cwd=repo, check=True, capture_output=True).stdout
        require(hashlib.sha256(committed).hexdigest() == item["sha256"], f"source commit digest mismatch: {relative}")
        require((repo / relative).is_file() and not (repo / relative).is_symlink(), f"source file missing: {relative}")
        require(sha256(repo / relative) == item["sha256"], f"source changed after capture: {relative}")
    require(observed_paths == sorted(observed_paths), "source closure is not sorted")
    require("workbench/src/data/cases.json" in observed_paths, "generated case data missing from source closure")
    require(
        manifest["capture"] == "REAL_LOCAL_WORKBENCH_INTERACTIONS",
        "demo is not declared as a real-workbench capture",
    )
    require(
        (root / "captions.srt").read_text() == (repo / "demo/captions.srt").read_text(),
        "rendered SRT captions do not match the public source",
    )
    require(
        (root / "captions.vtt").read_text() == (repo / "demo/captions.vtt").read_text(),
        "rendered WebVTT captions do not match the public source",
    )
    require(
        manifest.get("caption_sha256") == {
            "captions.srt": sha256(root / "captions.srt"),
            "captions.vtt": sha256(root / "captions.vtt"),
        },
        "caption digest binding mismatch",
    )
    print(
        json.dumps(
            {
                "audio": "NONE",
                "codec": stream["codec_name"],
                "duration_seconds": duration,
                "fps": stream["avg_frame_rate"],
                "resolution": f"{stream['width']}x{stream['height']}",
                "sha256": manifest["sha256"],
                "status": "PASS",
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
