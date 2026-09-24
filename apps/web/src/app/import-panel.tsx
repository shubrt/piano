"use client";

import { useRouter } from "next/navigation";
import { type DragEvent, type FormEvent, type ReactNode, useState } from "react";
import type { ImportProgress } from "@/lib/import";

const STEP_LABEL: Record<ImportProgress["step"], string> = {
  audio: "Audio geladen",
  transcribe: "Transkription",
  analyze: "Analyse",
  done: "fertig",
  error: "Fehler",
};

// URL field (several URLs separated by commas), MIDI drop zone (the whole page)
// and the status line of a running import.
export function ImportPanel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Imports every URL in the field one after another. Failed URLs stay in the
  // field so they can be retried, their errors in the status line.
  async function importUrls(event: FormEvent) {
    event.preventDefault();
    const urls = [...new Set(url.split(/[\s,]+/).filter(Boolean))];
    if (urls.length === 0 || busy) return;
    setBusy(true);
    const failed: { url: string; message: string }[] = [];
    try {
      for (const [index, next] of urls.entries()) {
        const prefix = urls.length > 1 ? `Import ${index + 1}/${urls.length}` : "Import läuft";
        const message = await importUrl(next, prefix).catch(
          (error: unknown) => `${next}: ${String(error)}`,
        );
        if (message) failed.push({ url: next, message });
      }
    } finally {
      setBusy(false);
      setUrl(failed.map((f) => f.url).join(", "));
      setStatus(failed.length > 0 ? `Fehler: ${failed.map((f) => f.message).join(" · ")}` : null);
    }
  }

  // Runs one import and returns the error message, or null on success.
  async function importUrl(target: string, prefix: string): Promise<string | null> {
    setStatus(`${prefix}: ${target} · Start`);
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: target }),
    });
    if (!response.ok || !response.body) {
      const error = ((await response.json().catch(() => null)) as { error?: string } | null)?.error;
      return `${target}: ${error ?? response.status}`;
    }
    let title = "";
    for await (const progress of readEvents(response.body)) {
      if ("title" in progress && progress.title) title = progress.title;
      if (progress.step === "error") return `${title || target}: ${progress.message}`;
      if (progress.step === "done") {
        router.refresh();
        return null;
      }
      setStatus(`${prefix}: ${title || target} · ${STEP_LABEL[progress.step]}`);
    }
    return `${title || target}: Verbindung abgebrochen`;
  }

  async function dropFile(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file || busy) return;
    setBusy(true);
    setStatus(`Analyse läuft: ${file.name}`);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/songs", { method: "POST", body: form });
      if (!response.ok) {
        setStatus(
          `Fehler: ${((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? response.status}`,
        );
        return;
      }
      setStatus(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
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
      <form className="import-row" onSubmit={importUrls}>
        <input
          type="text"
          placeholder="YouTube-URLs, mit Komma getrennt"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          Importieren
        </button>
      </form>
      <p className="dim">Oder eine MIDI-Datei auf die Seite ziehen.</p>
      {status ? (
        <p className={`status${status.startsWith("Fehler") ? "" : " dim"}`}>{status}</p>
      ) : null}
      {children}
    </main>
  );
}

// Parses the text/event-stream body into progress objects.
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ImportProgress> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
      if (data) yield JSON.parse(data) as ImportProgress;
    }
  }
}
