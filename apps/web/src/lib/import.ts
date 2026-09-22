import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { analyzeNewSong } from "./analyze";
import { db, schema } from "./db";
import type { ImportStatus } from "./db/schema";
import { env } from "./env";
import { createSong, uniqueSongId } from "./storage";

export type ImportJob = {
  id: string;
  status: ImportStatus;
  title: string | null;
  error: string | null;
  songId: string | null;
};

export type ImportSource =
  | { type: "youtube"; url: string }
  | { type: "audio"; fileName: string; bytes: Uint8Array };

// Creates the job row and wakes the worker. The worker downloads, converts and
// transcribes, then leaves the MIDI in the row with status "transcribed".
// Everything after that is TypeScript, see finishImport.
export async function startImport(source: ImportSource): Promise<ImportJob> {
  const id = randomUUID();
  await db.insert(schema.importJobs).values(
    source.type === "youtube"
      ? { id, url: source.url }
      : {
          id,
          audio: source.bytes,
          fileName: source.fileName,
          title: titleFromFile(source.fileName),
        },
  );
  try {
    const response = await fetch(new URL(`/jobs/${id}`, env.WORKER_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WORKER_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Worker antwortet ${response.status}`);
  } catch (error) {
    const message = `Worker nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`;
    await db
      .update(schema.importJobs)
      .set({ status: "error", error: message, updatedAt: new Date() })
      .where(eq(schema.importJobs.id, id));
  }
  return readImport(id);
}

// Current state for the browser's polling. When the worker is done this call
// also runs the analysis and creates the song, so no background process is
// needed on the web side.
export async function readImport(id: string): Promise<ImportJob> {
  const claimed = await db
    .update(schema.importJobs)
    .set({ status: "analyze", updatedAt: new Date() })
    .where(and(eq(schema.importJobs.id, id), eq(schema.importJobs.status, "transcribed")))
    .returning({
      title: schema.importJobs.title,
      url: schema.importJobs.url,
      midi: schema.importJobs.midi,
      fileName: schema.importJobs.fileName,
    });
  const job = claimed[0];
  if (job?.midi) await finishImport(id, job);

  const row = await db.query.importJobs.findFirst({
    where: eq(schema.importJobs.id, id),
    columns: { id: true, status: true, title: true, error: true, songId: true },
  });
  if (!row) throw new Error(`Import ${id} nicht gefunden`);
  return row;
}

async function finishImport(
  id: string,
  job: {
    title: string | null;
    url: string | null;
    midi: Uint8Array | null;
    fileName: string | null;
  },
): Promise<void> {
  try {
    const title = job.title || "Unbenannt";
    const songId = await uniqueSongId(title);
    const source = job.url
      ? ({ type: "youtube", url: job.url } as const)
      : ({ type: "midi", fileName: job.fileName ?? "audio" } as const);
    const song = await analyzeNewSong({ id: songId, title, source }, job.midi ?? new Uint8Array());
    await createSong(song, job.midi ?? new Uint8Array());
    await db
      .update(schema.importJobs)
      .set({ status: "done", songId, midi: null, audio: null, updatedAt: new Date() })
      .where(eq(schema.importJobs.id, id));
  } catch (error) {
    await db
      .update(schema.importJobs)
      .set({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(schema.importJobs.id, id));
  }
}

function titleFromFile(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "").trim() || "Unbenannt";
}
