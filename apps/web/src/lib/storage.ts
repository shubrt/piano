import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { type Song, SongSchema } from "./song";

// Songs live in the songs table: metadata as jsonb, the MIDI as bytea. Every
// signed-in user sees every song.

export async function listSongs(): Promise<Song[]> {
  const rows = await db
    .select({ id: schema.songs.id, title: schema.songs.title, data: schema.songs.data })
    .from(schema.songs);
  const songs: Song[] = [];
  for (const row of rows) {
    const song = SongSchema.safeParse({ id: row.id, title: row.title, ...row.data });
    if (song.success) songs.push(song.data);
    else console.warn(`Skipping song ${row.id}:`, song.error.message);
  }
  return songs.sort((a, b) => a.title.localeCompare(b.title, "de"));
}

export async function readSong(id: string): Promise<Song> {
  const row = await db.query.songs.findFirst({
    where: eq(schema.songs.id, id),
    columns: { id: true, title: true, data: true },
  });
  if (!row) throw new Error(`Song ${id} nicht gefunden`);
  return SongSchema.parse({ id: row.id, title: row.title, ...row.data });
}

export async function songExists(id: string): Promise<boolean> {
  return readSong(id).then(
    () => true,
    () => false,
  );
}

// Updates title and data of an existing song. New songs go through createSong.
export async function writeSong(song: Song): Promise<void> {
  const { id, title, ...data } = song;
  await db
    .update(schema.songs)
    .set({ title, data, updatedAt: new Date() })
    .where(eq(schema.songs.id, id));
}

export async function createSong(song: Song, midi: Uint8Array): Promise<void> {
  const { id, title, ...data } = song;
  await db.insert(schema.songs).values({ id, title, data, midi });
}

export async function readMidi(id: string): Promise<Uint8Array> {
  const row = await db.query.songs.findFirst({
    where: eq(schema.songs.id, id),
    columns: { midi: true },
  });
  if (!row) throw new Error(`Song ${id} nicht gefunden`);
  return row.midi;
}

export async function removeSong(id: string): Promise<void> {
  await db.delete(schema.songs).where(eq(schema.songs.id, id));
}

// Song id from a title, unique among existing songs: "secunda", "secunda-2", ...
export async function uniqueSongId(title: string): Promise<string> {
  const base = slug(title);
  const existing = new Set(
    (await db.select({ id: schema.songs.id }).from(schema.songs)).map((row) => row.id),
  );
  if (!existing.has(base)) return base;
  for (let n = 2; ; n++) if (!existing.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "song"
  );
}
