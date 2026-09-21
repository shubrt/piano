import { SongPatchSchema } from "@/lib/song";
import { readSong, removeSong, songExists, writeSong } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return Response.json(await readSong(id));
}

// Correction fields from the player: bpm, time signature, offset, split pitch, pedal trim.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const patch = SongPatchSchema.safeParse(await request.json());
  if (!patch.success) return Response.json({ error: patch.error.message }, { status: 400 });
  const song = { ...(await readSong(id)), ...patch.data };
  await writeSong(song);
  return Response.json(song);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!(await songExists(id)))
    return Response.json({ error: "Song nicht gefunden" }, { status: 404 });
  await removeSong(id);
  return new Response(null, { status: 204 });
}
