import { z } from "zod";
import { reanalyzeStructure } from "@/lib/analyze";
import { readMidi, readSong, writeSong } from "@/lib/storage";

const BodySchema = z.object({ ai: z.boolean().default(false) });

// Finds the parts again with the current grid. Without a body or with
// { ai: false } the heuristic runs, { ai: true } asks the model.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: body.error.message }, { status: 400 });
  const song = await reanalyzeStructure(await readSong(id), await readMidi(id), body.data);
  await writeSong(song);
  return Response.json(song);
}
