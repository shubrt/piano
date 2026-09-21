import { readImport } from "@/lib/import";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await readImport(id).catch(() => null);
  if (!job) return Response.json({ error: "Import nicht gefunden" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
