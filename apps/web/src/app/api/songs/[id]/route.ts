import { SongPatchSchema } from "@/lib/song";
import { readSong, removeSongDir, songExists, writeSong } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return Response.json(await readSong(id));
}

// Correction fields from the player: bpm, time signature, offset, split pitch, pedal trim,
// hand overrides.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const patch = SongPatchSchema.safeParse(await request.json());
  if (!patch.success) return Response.json({ error: patch.error.message }, { status: 400 });
  const song = { ...(await readSong(id)), ...patch.data };
  await writeSong(song);
  return Response.json(song);
}

// Deletes the song folder. Only ids of existing songs, so no path games.
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!(await songExists(id)))
    return Response.json({ error: "Song nicht gefunden" }, { status: 404 });
  await removeSongDir(id);
  return new Response(null, { status: 204 });
}
