"""YouTube URL to notes.mid.

Usage: uv run transcribe.py <url> <outdir>

Steps 1 to 3 of the pipeline: download audio, convert to mono WAV, transcribe
with Transkun. Progress goes to stdout as "key<TAB>value" lines that the Node
side forwards to the browser:

    title\t<video title>
    step\taudio
    step\ttranscribe
    done\t<path to notes.mid>

Requires yt-dlp and ffmpeg on PATH (brew install yt-dlp ffmpeg).
"""

import subprocess
import sys
from pathlib import Path


def report(key: str, value: str = "") -> None:
    print(f"{key}\t{value}", flush=True)


def run(cmd: list[str]) -> str:
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return result.stdout


def download_audio(url: str, tmp: Path) -> tuple[str, Path]:
    title = run(["yt-dlp", "--no-playlist", "--print", "%(title)s", "--skip-download", url]).strip()
    report("title", title)
    run(["yt-dlp", "--no-playlist", "-f", "bestaudio", "-o", str(tmp / "audio.%(ext)s"), url])
    audio = next(p for p in tmp.iterdir() if p.stem == "audio")
    return title, audio


def to_wav(audio: Path, wav: Path) -> None:
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(audio), "-ac", "1", "-ar", "44100", str(wav)])


def transcribe(wav: Path, mid: Path) -> None:
    """The swap point for hosting: replace with Replicate or Klangio later."""
    transkun = Path(sys.executable).parent / "transkun"
    run([str(transkun), str(wav), str(mid)])


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("usage: transcribe.py <url> <outdir>")
    url, outdir = sys.argv[1], Path(sys.argv[2])
    tmp = outdir / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)

    title, audio = download_audio(url, tmp)
    report("step", "audio")
    wav = tmp / "audio.wav"
    to_wav(audio, wav)
    report("step", "transcribe")
    mid = outdir / "notes.mid"
    transcribe(wav, mid)
    report("done", str(mid))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.stderr.write(error.stderr or str(error))
        sys.exit(1)
