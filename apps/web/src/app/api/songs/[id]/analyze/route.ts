import { reanalyzeStructure } from "@/lib/analyze";
import { readMidi, readSong, writeSong } from "@/lib/storage";

// "Struktur neu": asks the model again with the current grid.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const song = await reanalyzeStructure(await readSong(id), await readMidi(id));
  await writeSong(song);
  return Response.json(song);
}
