import { z } from "zod";
import { startImport } from "@/lib/import";

const BodySchema = z.object({ url: z.string().url() });
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

// Starts an import and returns the job. JSON body with a YouTube URL, or
// multipart with one audio "file". The browser polls /api/imports/:id.
export async function POST(request: Request) {
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ error: "Datei fehlt" }, { status: 400 });
    if (file.size > MAX_AUDIO_BYTES)
      return Response.json({ error: "Audiodatei größer als 50 MB" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    return Response.json(await startImport({ type: "audio", fileName: file.name, bytes }));
  }
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Ungültige URL" }, { status: 400 });
  return Response.json(await startImport({ type: "youtube", url: body.data.url }));
}
