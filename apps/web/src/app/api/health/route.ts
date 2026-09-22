import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// Railway's healthcheck. Fails while the database is unreachable so a broken
// deploy never replaces the running one.
export async function GET() {
  await db.execute(sql`select 1`);
  return Response.json({ ok: true });
}
