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


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the rendered portfolio demonstration")
    parser.add_argument("--root", default="dist/demo")
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    root = repo / args.root
    video = root / "evidence-first-ai-diligence-demo.mp4"
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

    assert lower <= duration <= upper, duration
    assert abs(duration - storyboard["target_duration_seconds"]) <= 0.1, duration
    assert len(video_streams) == 1
    assert audio_streams == []
    stream = video_streams[0]
    assert stream["codec_name"] == "h264"
    assert (stream["width"], stream["height"]) == (1920, 1080)
    assert stream["pix_fmt"] == "yuv420p"
    assert stream["avg_frame_rate"] == "30/1"
    assert manifest["sha256"] == sha256(video)
    assert manifest["packet_sha256"] and len(manifest["packet_sha256"]) == 64
    assert (root / "captions.srt").read_text() == (repo / "demo/captions.srt").read_text()
    assert (root / "captions.vtt").read_text() == (repo / "demo/captions.vtt").read_text()
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
