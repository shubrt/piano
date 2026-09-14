import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { analyzeNewSong } from "./analyze";
import type { Song } from "./song";
import { moveMidi, songsDir, uniqueSongId, writeSong } from "./storage";

export type ImportProgress =
  | { step: "audio" | "transcribe" | "analyze"; title?: string }
  | { step: "done"; song: Song }
  | { step: "error"; message: string };

// Full YouTube pipeline. Python does download, conversion and transcription and
// reports "key<TAB>value" lines on stdout; everything after that is TypeScript.
export async function importFromYoutube(
  url: string,
  onProgress: (p: ImportProgress) => void,
): Promise<Song> {
  const outDir = await mkdtemp(path.join(songsDir(), ".import-"));
  try {
    const { title, midPath } = await transcribeYoutube(url, outDir, onProgress);
    onProgress({ step: "analyze", title });
    const id = await uniqueSongId(title);
    await moveMidi(id, midPath);
    const song = await analyzeNewSong(
      { id, title, source: { type: "youtube", url } },
      await readBytes(path.join(songsDir(), id, "notes.mid")),
    );
    await writeSong(song);
    onProgress({ step: "done", song });
    return song;
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

async function readBytes(file: string): Promise<Uint8Array> {
  const { readFile } = await import("node:fs/promises");
  return new Uint8Array(await readFile(file));
}

// Runs import/transcribe.py through uv. Swap this function for a hosted
// transcription service later; the rest of the pipeline does not care.
function transcribeYoutube(
  url: string,
  outDir: string,
  onProgress: (p: ImportProgress) => void,
): Promise<{ title: string; midPath: string }> {
  return new Promise((resolve, reject) => {
    const importDir = path.resolve(process.cwd(), "import");
    const child = spawn(
      "uv",
      ["run", "--project", importDir, path.join(importDir, "transcribe.py"), url, outDir],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let title = "";
    let midPath = "";
    let stderr = "";
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const [key, ...rest] = line.split("\t");
        const value = rest.join("\t");
        if (key === "title") title = value;
        else if (key === "step" && (value === "audio" || value === "transcribe"))
          onProgress({ step: value, title });
        else if (key === "done") midPath = value;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) =>
      reject(new Error(`uv konnte nicht gestartet werden: ${error.message}`)),
    );
    child.on("close", (code) => {
      if (code === 0 && midPath) resolve({ title: title || "Unbenannt", midPath });
      else
        reject(
          new Error(
            `Transkription fehlgeschlagen (Exit ${code}): ${stderr.trim().split("\n").slice(-5).join(" | ")}`,
          ),
        );
    });
  });
}
