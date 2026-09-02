from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


WIDTH = 1920
HEIGHT = 1080
FPS = 30
DEMO_SOURCE = Path("demo/final")
VIDEO_NAME = "underwriting-desk-demo-1080p.mp4"


def run(command: list[str], *, cwd: Path | None = None) -> None:
    subprocess.run(command, check=True, cwd=cwd, capture_output=True, text=True)


def command_output(command: list[str], *, cwd: Path) -> str:
    return subprocess.run(
        command, check=True, cwd=cwd, capture_output=True, text=True
    ).stdout.strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode()


def source_closure(repo: Path) -> list[dict[str, str]]:
    tracked = command_output(["git", "ls-files"], cwd=repo).splitlines()
    exact = {
        "scripts/render_demo.py",
        "scripts/verify_demo.py",
        "workbench/index.html",
        "workbench/case-data-plugin.ts",
        "workbench/package.json",
        "workbench/pnpm-lock.yaml",
        "workbench/tsconfig.app.json",
        "workbench/tsconfig.json",
        "workbench/tsconfig.node.json",
        "workbench/vercel.json",
        "workbench/vite.config.ts",
        "workbench/scripts/render-demo.mjs",
    }
    selected = sorted(
        path
        for path in tracked
        if path in exact
        or path.startswith("demo/final/")
        or path.startswith("output/pdf/")
        or path.startswith("workbench/api/")
        or path.startswith("workbench/src/")
    )
    required = {
        "demo/final/storyboard.json",
        "demo/final/transcript.txt",
        "demo/final/captions.srt",
        "demo/final/captions.vtt",
        "demo/final/thumbnail-spec.json",
        "output/pdf/atlasgrid-underwriting-packet-letter.pdf",
        "output/pdf/helios-underwriting-packet-letter.pdf",
        "workbench/api/challenge.ts",
        "workbench/src/data/cases.json",
        "workbench/vercel.json",
    }
    missing = sorted(required - set(selected))
    if missing:
        raise RuntimeError(f"demo source closure is incomplete: {missing}")
    return [{"path": path, "sha256": sha256(repo / path)} for path in selected]


def require_clean_commit(repo: Path) -> None:
    dirty = (
        subprocess.run(["git", "diff", "--quiet"], cwd=repo).returncode != 0
        or subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo).returncode
        != 0
        or bool(command_output(["git", "ls-files", "--others", "--exclude-standard"], cwd=repo))
    )
    if dirty:
        raise RuntimeError("demo rendering requires a clean tracked source commit")


def probe_duration(path: Path) -> float:
    return float(
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nk=1:nw=1",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    )


def validate_tts_receipt(audio: Path, receipt_path: Path) -> dict[str, Any]:
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    required = {
        "schema_version": "media-tts-execution/v1",
        "tts_provider": "elevenlabs",
        "publishable": True,
    }
    for key, expected in required.items():
        if receipt.get(key) != expected:
            raise RuntimeError(f"TTS receipt {key} mismatch")
    for key in ("tts_voice_id", "tts_voice_name", "tts_model_id", "tts_request_id"):
        if not str(receipt.get(key) or "").strip():
            raise RuntimeError(f"TTS receipt {key} missing")
    if not isinstance(receipt.get("tts_billed_characters"), int) or receipt[
        "tts_billed_characters"
    ] <= 0:
        raise RuntimeError("TTS receipt billed characters must be positive")
    if receipt.get("output_sha256") != sha256(audio):
        raise RuntimeError("TTS receipt does not bind the supplied narration")
    return receipt


def font(size: int, *, bold: bool = False):
    from PIL import ImageFont

    candidates = (
        [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
        if bold
        else [
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
    )
    for candidate in candidates:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def create_thumbnail(frame: Path, spec_path: Path, destination: Path) -> None:
    from PIL import Image, ImageDraw, ImageOps

    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    size = (int(spec["width"]), int(spec["height"]))
    base = ImageOps.fit(Image.open(frame).convert("RGB"), size, method=Image.Resampling.LANCZOS)
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle(
        (44, 44, 674, 676),
        radius=18,
        fill=(247, 244, 237, 246),
        outline=(32, 38, 43, 255),
        width=2,
    )
    graphite = spec["colors"]["graphite"]
    cobalt = spec["colors"]["cobalt"]
    draw.text((86, 92), spec["eyebrow"], font=font(23, bold=True), fill=cobalt)
    draw.multiline_text(
        (86, 164),
        spec["headline"].replace(" to ", "\nto ", 1),
        font=font(72, bold=True),
        fill=graphite,
        spacing=2,
    )
    draw.multiline_text(
        (86, 368),
        spec["subhead"].replace(" · ", "\n"),
        font=font(28),
        fill=graphite,
        spacing=8,
    )
    draw.line((86, 440, 616, 440), fill=cobalt, width=5)
    draw.multiline_text(
        (86, 478),
        spec["case_line"].replace("   /   ", "\n"),
        font=font(32, bold=True),
        fill=graphite,
        spacing=16,
    )
    Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB").save(
        destination, "PNG", optimize=True
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render the narrated, source-bound underwriting product demonstration"
    )
    parser.add_argument("--out", default="dist/release-demo")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--tts-receipt", required=True)
    parser.add_argument("--base-url", required=True)
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    out = (repo / args.out).resolve()
    audio_source = Path(args.audio).resolve()
    tts_receipt_source = Path(args.tts_receipt).resolve()
    source = repo / DEMO_SOURCE
    storyboard_path = source / "storyboard.json"
    storyboard = json.loads(storyboard_path.read_text(encoding="utf-8"))
    target = int(storyboard["target_duration_seconds"])
    lower, upper = map(int, storyboard["allowed_duration_seconds"])
    if not (75 <= lower <= target <= upper <= 90):
        raise RuntimeError("storyboard duration contract must remain within 75–90 seconds")
    base_url = str(args.base_url).rstrip("/") + "/"
    if base_url != "https://underwriting-desk-delta.vercel.app/":
        raise RuntimeError("demo base URL must be the canonical HTTPS deployment")

    for binary in ("ffmpeg", "ffprobe", "node", "pnpm"):
        if shutil.which(binary) is None:
            raise RuntimeError(f"{binary} is required")
    for path, label in (
        (audio_source, "narration audio"),
        (tts_receipt_source, "TTS execution receipt"),
    ):
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f"{label} is missing or unsafe")

    require_clean_commit(repo)
    if out.exists() and any(out.iterdir()):
        raise RuntimeError(f"output directory must be empty: {out}")
    out.mkdir(parents=True, exist_ok=True)
    frames = out / "review-frames"
    frames.mkdir()

    tts_receipt = validate_tts_receipt(audio_source, tts_receipt_source)
    narration_duration = probe_duration(audio_source)
    if not 72.0 <= narration_duration <= target - 0.5:
        raise RuntimeError(
            f"narration duration must be 72.0–{target - 0.5:.1f}s, observed {narration_duration:.3f}s"
        )

    source_commit = command_output(["git", "rev-parse", "HEAD"], cwd=repo)
    source_tree_oid = command_output(["git", "rev-parse", "HEAD^{tree}"], cwd=repo)
    closure = source_closure(repo)
    closure_sha256 = hashlib.sha256(canonical_bytes(closure)).hexdigest()

    raw = out / "workbench-capture.webm"
    run(
        [
            "node",
            "scripts/render-demo.mjs",
            "--out",
            str(raw),
            "--frames-dir",
            str(frames),
            "--storyboard",
            str(storyboard_path),
            "--base-url",
            base_url,
        ],
        cwd=repo / "workbench",
    )
    capture_receipt_path = out / "capture-receipt.json"
    capture_receipt = json.loads(capture_receipt_path.read_text(encoding="utf-8"))
    expected_frames = storyboard["expected_review_frames"]
    observed_frames = [item["filename"] for item in capture_receipt.get("frames", [])]
    if observed_frames != expected_frames:
        raise RuntimeError("capture receipt review-frame sequence mismatch")
    observed_claims = {item["text"] for item in capture_receipt.get("observed_claims", [])}
    missing_claims = sorted(set(storyboard["required_visible_claims"]) - observed_claims)
    if missing_claims:
        raise RuntimeError(f"capture did not observe required claims: {missing_claims}")

    narration = out / "narration.mp3"
    tts_receipt_copy = out / "tts-execution.json"
    shutil.copy2(audio_source, narration)
    shutil.copy2(tts_receipt_source, tts_receipt_copy)
    for name in ("captions.srt", "captions.vtt", "transcript.txt", "storyboard.json"):
        shutil.copy2(source / name, out / name)

    video = out / VIDEO_NAME
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(raw),
            "-i",
            str(narration),
            "-filter_complex",
            (
                f"[0:v]tpad=stop_mode=clone:stop_duration={target},"
                f"trim=duration={target},fps={FPS},format=yuv420p[v];"
                f"[1:a]loudnorm=I=-16:TP=-1:LRA=7,apad=pad_dur={target},"
                f"atrim=duration={target},aresample=48000[a]"
            ),
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-profile:v",
            "high",
            "-level:v",
            "4.1",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-movflags",
            "+faststart",
            "-metadata",
            "creation_time=1970-01-01T00:00:00Z",
            "-metadata",
            "title=Underwriting Desk - Evidence to Decision",
            "-metadata",
            "artist=Cooper David Reed",
            str(video),
        ]
    )
    raw.unlink()

    thumbnail_spec = json.loads((source / "thumbnail-spec.json").read_text())
    thumbnail = out / "thumbnail-1280x720.png"
    create_thumbnail(
        frames / thumbnail_spec["source_frame"], source / "thumbnail-spec.json", thumbnail
    )
    frame_manifest = [
        {
            "path": f"review-frames/{name}",
            "sha256": sha256(frames / name),
            "bytes": (frames / name).stat().st_size,
        }
        for name in expected_frames
    ]
    pdfs = [
        {
            "path": path.relative_to(repo).as_posix(),
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        }
        for path in sorted((repo / "output/pdf").glob("*.pdf"))
    ]
    manifest = {
        "schema_version": "underwriting.demo-manifest/v3",
        "status": "RENDERED_PENDING_INDEPENDENT_REVIEW",
        "video": VIDEO_NAME,
        "sha256": sha256(video),
        "duration_seconds": target,
        "resolution": f"{WIDTH}x{HEIGHT}",
        "fps": FPS,
        "audio": {
            "file": narration.name,
            "sha256": sha256(narration),
            "raw_duration_seconds": round(narration_duration, 6),
            "codec": "mp3",
            "final_codec": "aac",
            "sample_rate_hz": 48000,
            "channels": 1,
            "target_integrated_lufs": -16,
            "target_true_peak_dbtp": -1,
        },
        "tts": {
            key: tts_receipt[key]
            for key in (
                "tts_provider",
                "tts_voice_id",
                "tts_voice_name",
                "tts_model_id",
                "tts_billed_characters",
                "tts_request_id",
                "tts_render_call",
                "publishable",
            )
        }
        | {"receipt": tts_receipt_copy.name, "receipt_sha256": sha256(tts_receipt_copy)},
        "captions": {
            name: {"sha256": sha256(out / name), "bytes": (out / name).stat().st_size}
            for name in ("captions.srt", "captions.vtt")
        },
        "transcript": {
            "file": "transcript.txt",
            "sha256": sha256(out / "transcript.txt"),
            "bytes": (out / "transcript.txt").stat().st_size,
        },
        "thumbnail": {
            "file": thumbnail.name,
            "sha256": sha256(thumbnail),
            "bytes": thumbnail.stat().st_size,
            "resolution": "1280x720",
        },
        "review_frames": frame_manifest,
        "capture_receipt": {
            "file": capture_receipt_path.name,
            "sha256": sha256(capture_receipt_path),
        },
        "pdfs": pdfs,
        "capture": "REAL_PUBLIC_WORKBENCH_INTERACTIONS",
        "deployed_url": base_url,
        "source_commit": source_commit,
        "source_tree_oid": source_tree_oid,
        "source_closure": closure,
        "source_closure_sha256": closure_sha256,
        "toolchain": {
            "node": command_output(["node", "--version"], cwd=repo),
            "pnpm": command_output(["pnpm", "--version"], cwd=repo),
            "ffmpeg": command_output(["ffmpeg", "-version"], cwd=repo).splitlines()[0],
        },
        "limitations": storyboard["limitations"],
    }
    manifest["manifest_sha256"] = hashlib.sha256(canonical_bytes(manifest)).hexdigest()
    (out / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
