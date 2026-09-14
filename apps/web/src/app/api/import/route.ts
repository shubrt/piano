import { z } from "zod";
import { type ImportProgress, importFromYoutube } from "@/lib/import";

const BodySchema = z.object({ url: z.string().url() });

// Starts a YouTube import and streams progress as Server-Sent Events. The
// import keeps running if the browser disconnects.
export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json());
  if (!body.success) return Response.json({ error: "Ungültige URL" }, { status: 400 });
  const url = body.data.url;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (progress: ImportProgress) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
        } catch {
          closed = true;
        }
      };
      importFromYoutube(url, send)
        .catch((error: unknown) =>
          send({ step: "error", message: error instanceof Error ? error.message : String(error) }),
        )
        .finally(() => {
          if (!closed) controller.close();
          closed = true;
        });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
