"""Import worker: YouTube URL or uploaded audio to MIDI.

Usage: uv run worker.py            (reads DATABASE_URL, WORKER_TOKEN, PORT)

The web app inserts a row into import_jobs and calls POST /jobs/<id> with the
shared token. That request wakes a sleeping Railway service; the job itself
runs in a background thread so the response is immediate. Steps and their
status values in the row:

    queued      -> audio        yt-dlp download or the uploaded file, ffmpeg to mono WAV
    audio       -> transcribe   Transkun writes notes.mid
    transcribe  -> transcribed  MIDI bytes in the row, the web app takes over
    any         -> error        message in the error column

Requires ffmpeg on PATH. yt-dlp is a Python dependency.
"""

import os
import queue
import socket
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import psycopg
import yt_dlp

DATABASE_URL = os.environ["DATABASE_URL"]
TOKEN = os.environ["WORKER_TOKEN"]
# portless (locally) and Railway both hand the port over in PORT.
PORT = int(os.environ.get("PORT", "8000"))

jobs: "queue.Queue[str]" = queue.Queue()


def connect() -> psycopg.Connection:
    # Autocommit: every status update is visible to the web app right away.
    return psycopg.connect(DATABASE_URL, autocommit=True)


def set_status(job_id: str, status: str, **fields: object) -> None:
    columns = ", ".join(f"{name} = %s" for name in fields)
    sql = f"UPDATE import_jobs SET status = %s, updated_at = now(){', ' + columns if columns else ''} WHERE id = %s"
    with connect() as conn:
        conn.execute(sql, [status, *fields.values(), job_id])


def download_audio(url: str, tmp: Path) -> tuple[str, Path]:
    options = {
        "noplaylist": True,
        "format": "bestaudio",
        "outtmpl": str(tmp / "audio.%(ext)s"),
        "quiet": True,
        "noprogress": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=True)
    title = str((info or {}).get("title") or "Unbenannt")
    audio = next(p for p in tmp.iterdir() if p.stem == "audio")
    return title, audio


def to_wav(audio: Path, wav: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(audio), "-ac", "1", "-ar", "44100", str(wav)],
        check=True,
        capture_output=True,
        text=True,
    )


def transcribe(wav: Path, mid: Path) -> None:
    transkun = Path(sys.executable).parent / "transkun"
    subprocess.run([str(transkun), str(wav), str(mid)], check=True, capture_output=True, text=True)


def heartbeat(job_id: str, stop: threading.Event) -> None:
    """Touches the row every 30 s while a job runs. Railway puts a serverless
    service to sleep after five minutes without outbound traffic, and a
    transcription on CPU is exactly that. The updates keep the container awake."""
    while not stop.wait(30):
        try:
            with connect() as conn:
                conn.execute("UPDATE import_jobs SET updated_at = now() WHERE id = %s", [job_id])
        except Exception as error:  # noqa: BLE001
            sys.stderr.write(f"heartbeat failed: {error}\n")


def requeue_interrupted() -> None:
    """Jobs the previous container left in audio or transcribe (it was stopped
    or crashed mid-way) start over."""
    with connect() as conn:
        rows = conn.execute(
            "UPDATE import_jobs SET status = 'queued', updated_at = now() "
            "WHERE status IN ('audio', 'transcribe') RETURNING id"
        ).fetchall()
    for (job_id,) in rows:
        jobs.put(job_id)
    if rows:
        print(f"requeued {len(rows)} interrupted job(s)", flush=True)


def run_job(job_id: str) -> None:
    with connect() as conn:
        row = conn.execute(
            "SELECT url, audio, file_name FROM import_jobs WHERE id = %s AND status = 'queued'", [job_id]
        ).fetchone()
    if row is None:
        return
    url, audio_bytes, file_name = row
    stop = threading.Event()
    threading.Thread(target=heartbeat, args=(job_id, stop), daemon=True).start()
    with tempfile.TemporaryDirectory() as folder:
        tmp = Path(folder)
        try:
            if url:
                title, audio = download_audio(url, tmp)
                set_status(job_id, "audio", title=title)
            else:
                audio = tmp / f"audio{Path(file_name or 'upload.wav').suffix or '.wav'}"
                audio.write_bytes(bytes(audio_bytes))
                set_status(job_id, "audio")
            wav = tmp / "audio.wav"
            if audio != wav:
                to_wav(audio, wav)
            set_status(job_id, "transcribe")
            mid = tmp / "notes.mid"
            transcribe(wav, mid)
            set_status(job_id, "transcribed", midi=mid.read_bytes(), audio=None)
        except subprocess.CalledProcessError as error:
            tail = " | ".join((error.stderr or str(error)).strip().split("\n")[-5:])
            set_status(job_id, "error", error=f"{Path(error.cmd[0]).name} fehlgeschlagen: {tail}")
        except Exception as error:  # noqa: BLE001, one job must not take the worker down
            set_status(job_id, "error", error=describe(error))
        finally:
            stop.set()


def describe(error: Exception) -> str:
    """yt-dlp's bot check is the one error users can act on themselves."""
    text = str(error)
    if "Sign in to confirm" in text:
        return "YouTube blockiert Downloads von diesem Server. Audiodatei stattdessen auf die Seite ziehen."
    return text[:2000]


def work_forever() -> None:
    while True:
        run_job(jobs.get())


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self.reply(200, "ok")
        else:
            self.reply(404, "not found")

    def do_POST(self) -> None:  # noqa: N802
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.reply(401, "unauthorized")
            return
        prefix = "/jobs/"
        if not self.path.startswith(prefix) or len(self.path) <= len(prefix):
            self.reply(404, "not found")
            return
        jobs.put(self.path[len(prefix) :])
        self.reply(202, "queued")

    def reply(self, status: int, body: str) -> None:
        data = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        sys.stderr.write(f"{self.address_string()} {format % args}\n")


class DualStackServer(ThreadingHTTPServer):
    """Listens on IPv6 and IPv4: Railway's private network is IPv6 only, the
    portless proxy connects over 127.0.0.1."""

    address_family = socket.AF_INET6

    def server_bind(self) -> None:
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    # A database that is down at boot must not keep the worker from serving
    # /health; the jobs themselves report their own connection errors.
    try:
        requeue_interrupted()
    except Exception as error:  # noqa: BLE001
        sys.stderr.write(f"requeue skipped, database unreachable: {error}\n")
    threading.Thread(target=work_forever, daemon=True).start()
    server = DualStackServer(("::", PORT), Handler)
    print(f"worker listening on :{PORT}", flush=True)
    server.serve_forever()
