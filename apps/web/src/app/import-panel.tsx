"use client";

import { useRouter } from "next/navigation";
import { type DragEvent, type FormEvent, type ReactNode, useState } from "react";
import type { ImportJob } from "@/lib/import";

const STEP_LABEL: Record<ImportJob["status"], string> = {
  queued: "wartet auf den Worker",
  audio: "Audio geladen",
  transcribe: "Transkription",
  transcribed: "Transkription fertig",
  analyze: "Analyse",
  done: "fertig",
  error: "Fehler",
};

// URL field, drop zone for MIDI or audio files (the whole page) and the status
// line of a running import. Imports run in the worker, the panel polls the job.
export function ImportPanel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function run(label: string, start: () => Promise<Response>) {
    if (busy) return;
    setBusy(true);
    setStatus(`Import läuft: ${label}`);
    try {
      const response = await start();
      if (!response.ok) {
        setStatus(`Fehler: ${await errorText(response)}`);
        return;
      }
      const started = (await response.json()) as ImportJob;
      if (started.status === "done") {
        setStatus(null);
        setUrl("");
        router.refresh();
        return;
      }
      const outcome = await pollJob(started.id, (job) =>
        setStatus(`Import läuft: ${job.title ?? label} · ${STEP_LABEL[job.status]}`),
      );
      if (outcome.status === "error") {
        setStatus(`Fehler: ${outcome.error ?? "unbekannt"}`);
        return;
      }
      setStatus(null);
      setUrl("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function importUrl(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    void run(value, () =>
      fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      }),
    );
  }

  function dropFile(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    // MIDI needs only the analysis, audio goes through the worker.
    const endpoint = /\.midi?$/i.test(file.name) ? "/api/songs" : "/api/imports";
    void run(file.name, () => fetch(endpoint, { method: "POST", body: form }));
  }

  return (
    <main
      className={`home${dragging ? " drop-active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={dropFile}
    >
      <h1>Neuer Song</h1>
      <form className="import-row" onSubmit={importUrl}>
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          Importieren
        </button>
      </form>
      <p className="dim">Oder eine MIDI- oder Audiodatei auf die Seite ziehen.</p>
      {status ? (
        <p className={`status${status.startsWith("Fehler") ? "" : " dim"}`}>{status}</p>
      ) : null}
      {children}
    </main>
  );
}

async function errorText(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? String(response.status);
}

// Asks for the job every two seconds until it is done or failed.
async function pollJob(id: string, onProgress: (job: ImportJob) => void): Promise<ImportJob> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await fetch(`/api/imports/${id}`, { cache: "no-store" });
    if (!response.ok)
      return { id, status: "error", title: null, songId: null, error: await errorText(response) };
    const job = (await response.json()) as ImportJob;
    if (job.status === "done" || job.status === "error") return job;
    onProgress(job);
  }
}
