import { readMidi } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bytes = await readMidi(id);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "audio/midi", "Cache-Control": "no-store" },
  });
}
