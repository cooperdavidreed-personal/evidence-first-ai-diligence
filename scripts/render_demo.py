from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from ic_evidence_lab.pipeline import run_case


WIDTH = 1920
HEIGHT = 1080
FPS = 30
BG = "#07110f"
PANEL = "#10201b"
INK = "#edf8f2"
MUTED = "#a9c1b6"
ACCENT = "#75f0ad"
LINE = "#29463b"


def font_path(monospace: bool = False) -> Path:
    candidates = (
        [Path("/System/Library/Fonts/SFNSMono.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")]
        if monospace
        else [Path("/System/Library/Fonts/SFNS.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise RuntimeError("No supported local font found (SFNS or DejaVu Sans)")


def fitted_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or draw.textlength(candidate, font=font) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def timestamp(seconds: int, separator: str) -> str:
    hours, remaining = divmod(seconds, 3600)
    minutes, secs = divmod(remaining, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{separator}000"


def captions_srt(scenes: list[dict[str, object]]) -> str:
    blocks = []
    for index, scene in enumerate(scenes, start=1):
        blocks.append(
            f"{index}\n{timestamp(int(scene['start']), ',')} --> {timestamp(int(scene['end']), ',')}\n{scene['caption']}"
        )
    return "\n\n".join(blocks) + "\n"


def captions_vtt(scenes: list[dict[str, object]]) -> str:
    blocks = ["WEBVTT"]
    for scene in scenes:
        blocks.append(
            f"{timestamp(int(scene['start']), '.')} --> {timestamp(int(scene['end']), '.')}\n{scene['caption']}"
        )
    return "\n\n".join(blocks) + "\n"


def render_slide(scene: dict[str, object], index: int, total: int, values: dict[str, str], destination: Path) -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    gradient = Image.new("RGB", (1, HEIGHT))
    pixels = gradient.load()
    for y in range(HEIGHT):
        factor = y / HEIGHT
        pixels[0, y] = (7 + int(10 * factor), 17 + int(24 * factor), 15 + int(18 * factor))
    image.paste(gradient.resize((WIDTH, HEIGHT)), (0, 0))
    draw = ImageDraw.Draw(image)

    regular = font_path()
    mono = font_path(monospace=True)
    eyebrow_font = ImageFont.truetype(str(regular), 30)
    title_font = ImageFont.truetype(str(regular), 88)
    body_font = ImageFont.truetype(str(regular), 40)
    proof_font = ImageFont.truetype(str(mono), 28)
    caption_font = ImageFont.truetype(str(regular), 30)
    small_font = ImageFont.truetype(str(mono), 22)

    draw.rounded_rectangle((96, 70, 1824, 1010), radius=28, fill=PANEL, outline=LINE, width=2)
    draw.rectangle((96, 70, 112, 1010), fill=ACCENT)
    draw.text((160, 130), str(scene["eyebrow"]), font=eyebrow_font, fill=ACCENT)
    draw.text((1650, 132), f"{index + 1:02d} / {total:02d}", font=small_font, fill=MUTED)

    title_lines = fitted_lines(draw, str(scene["title"]), title_font, 1460)
    title_y = 215
    for line in title_lines:
        draw.text((160, title_y), line, font=title_font, fill=INK)
        title_y += 104

    body_y = max(475, title_y + 28)
    for line in fitted_lines(draw, str(scene["body"]), body_font, 1460):
        draw.text((160, body_y), line, font=body_font, fill=MUTED)
        body_y += 58

    proof = str(scene["proof"]).format(**values)
    proof_top = 695
    draw.rounded_rectangle((160, proof_top, 1760, 825), radius=18, fill=BG, outline=LINE, width=2)
    proof_y = proof_top + 28
    for line in fitted_lines(draw, proof, proof_font, 1510):
        draw.text((200, proof_y), line, font=proof_font, fill=ACCENT)
        proof_y += 40

    caption = str(scene["caption"])
    caption_lines = fitted_lines(draw, caption, caption_font, 1480)
    caption_y = 865
    for line in caption_lines[:2]:
        draw.text((160, caption_y), line, font=caption_font, fill=INK)
        caption_y += 42
    draw.text((160, 970), str(scene["source"]), font=small_font, fill=MUTED)

    dot_x = 1510
    for dot in range(total):
        color = ACCENT if dot == index else LINE
        draw.rounded_rectangle((dot_x + dot * 38, 970, dot_x + 24 + dot * 38, 980), radius=5, fill=color)

    image.save(destination, format="PNG", optimize=True)


def run(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the deterministic portfolio demonstration")
    parser.add_argument("--out", default="dist/demo")
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    out = repo / args.out
    frames = out / "frames"
    segments = out / "segments"
    frames.mkdir(parents=True, exist_ok=True)
    segments.mkdir(parents=True, exist_ok=True)
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise RuntimeError("ffmpeg and ffprobe are required")

    storyboard = json.loads((repo / "demo/storyboard.json").read_text())
    scenes = storyboard["scenes"]
    if captions_srt(scenes) != (repo / "demo/captions.srt").read_text():
        raise RuntimeError("demo/captions.srt does not match storyboard.json")
    if captions_vtt(scenes) != (repo / "demo/captions.vtt").read_text():
        raise RuntimeError("demo/captions.vtt does not match storyboard.json")

    packet, receipt = run_case(repo / "examples/vectorforge/case-after.json")
    values = {
        "packet_sha256": receipt["packet_sha256"],
        "claim_count": str(len(packet["claim_results"])),
        "question_count": str(len(packet["open_questions"])),
    }

    segment_paths: list[Path] = []
    for index, scene in enumerate(scenes):
        source = repo / scene["source"]
        if not source.is_file():
            raise RuntimeError(f"Missing declared scene source: {scene['source']}")
        frame = frames / f"scene-{index + 1:02d}.png"
        segment = segments / f"scene-{index + 1:02d}.mp4"
        render_slide(scene, index, len(scenes), values, frame)
        duration = int(scene["end"]) - int(scene["start"])
        fade_out = duration - 0.35
        run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-loop", "1", "-framerate", str(FPS), "-i", str(frame),
                "-t", str(duration),
                "-vf", f"fade=t=in:st=0:d=0.35,fade=t=out:st={fade_out:.2f}:d=0.35,format=yuv420p",
                "-r", str(FPS), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-metadata", "creation_time=1970-01-01T00:00:00Z", str(segment),
            ]
        )
        segment_paths.append(segment)

    concat = out / "segments.txt"
    concat.write_text("".join(f"file '{path.as_posix()}'\n" for path in segment_paths), encoding="utf-8")
    video = out / "evidence-first-ai-diligence-demo.mp4"
    run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
            "-i", str(concat), "-c", "copy", "-movflags", "+faststart",
            "-metadata", "title=Evidence-First AI Diligence", "-metadata", "artist=Cooper Reed", str(video),
        ]
    )
    shutil.copy2(repo / "demo/captions.srt", out / "captions.srt")
    shutil.copy2(repo / "demo/captions.vtt", out / "captions.vtt")
    manifest = {
        "status": "RENDERED_LOCAL",
        "video": video.name,
        "sha256": sha256(video),
        "duration_seconds": storyboard["target_duration_seconds"],
        "resolution": f"{WIDTH}x{HEIGHT}",
        "fps": FPS,
        "audio": "NONE",
        "captions": ["captions.srt", "captions.vtt"],
        "packet_sha256": receipt["packet_sha256"],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
