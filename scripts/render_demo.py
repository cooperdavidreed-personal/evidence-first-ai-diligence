from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


WIDTH = 1440
HEIGHT = 900
FPS = 30


def run(command: list[str], *, cwd: Path | None = None) -> None:
    subprocess.run(command, check=True, cwd=cwd, capture_output=True, text=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the real-workbench portfolio demonstration")
    parser.add_argument("--out", default="dist/demo")
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    out = repo / args.out
    out.mkdir(parents=True, exist_ok=True)
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise RuntimeError("ffmpeg and ffprobe are required")
    if shutil.which("node") is None or shutil.which("pnpm") is None:
        raise RuntimeError("node and pnpm are required")

    storyboard = json.loads((repo / "demo/storyboard.json").read_text())
    target = int(storyboard["target_duration_seconds"])
    raw = out / "workbench-capture.webm"
    run(
        ["node", "scripts/render-demo.mjs", "--out", str(raw)],
        cwd=repo / "workbench",
    )
    video = out / "underwriting-intelligence-lab-demo.mp4"
    run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
            "-vf", f"tpad=stop_mode=clone:stop_duration={target},trim=duration={target},fps={FPS},format=yuv420p",
            "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart",
            "-metadata", "creation_time=1970-01-01T00:00:00Z",
            "-metadata", "title=Underwriting Intelligence Lab — Product Walkthrough",
            "-metadata", "artist=Cooper David Reed", str(video),
        ]
    )
    for webm in out.glob("*.webm"):
        webm.unlink()
    shutil.copy2(repo / "demo/captions.srt", out / "captions.srt")
    shutil.copy2(repo / "demo/captions.vtt", out / "captions.vtt")
    manifest = {
        "schema_version": "underwriting.demo-manifest/v2",
        "status": "RENDERED_LOCAL_FOUNDER_REVIEW_PENDING",
        "video": video.name,
        "sha256": sha256(video),
        "duration_seconds": target,
        "resolution": f"{WIDTH}x{HEIGHT}",
        "fps": FPS,
        "audio": "NONE",
        "captions": ["captions.srt", "captions.vtt"],
        "capture": "REAL_LOCAL_WORKBENCH_INTERACTIONS",
        "limitations": "Synthetic cases; recorded browser walkthrough; no production or investment-performance claim.",
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
