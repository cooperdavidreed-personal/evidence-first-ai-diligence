from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


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
