import { analyzeNewSong } from "@/lib/analyze";
import { parseMidi } from "@/lib/midi";
import { listSongs, uniqueSongId, writeMidi, writeSong } from "@/lib/storage";

export async function GET() {
  return Response.json(await listSongs());
}

// MIDI drop: multipart form with one "file". Runs the analysis, no transcription.
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Datei fehlt" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    parseMidi(bytes);
  } catch (error) {
    return Response.json(
      {
        error: `Keine lesbare MIDI-Datei: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 400 },
    );
  }
  const title = file.name.replace(/\.midi?$/i, "").trim() || "Unbenannt";
  const id = await uniqueSongId(title);
  await writeMidi(id, bytes);
  const song = await analyzeNewSong(
    { id, title, source: { type: "midi", fileName: file.name } },
    bytes,
  );
  await writeSong(song);
  return Response.json(song);
}
