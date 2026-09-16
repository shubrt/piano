import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { type Song, SongSchema } from "./song";

// Songs are folders under SONGS_DIR (default ~/.piano/songs): notes.mid plus
// song.json. No database, the song list is a directory listing.

export function songsDir(): string {
  return path.resolve(process.cwd(), env.SONGS_DIR);
}

export function songDir(id: string): string {
  return path.join(songsDir(), id);
}

export async function listSongs(): Promise<Song[]> {
  await mkdir(songsDir(), { recursive: true });
  const entries = await readdir(songsDir(), { withFileTypes: true });
  const songs: Song[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const song = await readSong(entry.name).catch((error: unknown) => {
      console.warn(`Skipping song folder ${entry.name}:`, error);
      return null;
    });
    if (song) songs.push(song);
  }
  return songs.sort((a, b) => a.title.localeCompare(b.title, "de"));
}

export async function readSong(id: string): Promise<Song> {
  const raw = await readFile(path.join(songDir(id), "song.json"), "utf8");
  return SongSchema.parse(JSON.parse(raw));
}

export async function songExists(id: string): Promise<boolean> {
  return readSong(id).then(
    () => true,
    () => false,
  );
}

export async function writeSong(song: Song): Promise<void> {
  await mkdir(songDir(song.id), { recursive: true });
  await writeFile(path.join(songDir(song.id), "song.json"), JSON.stringify(song, null, 2) + "\n");
}

export async function readMidi(id: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(songDir(id), "notes.mid")));
}

export async function writeMidi(id: string, bytes: Uint8Array): Promise<void> {
  await mkdir(songDir(id), { recursive: true });
  await writeFile(path.join(songDir(id), "notes.mid"), bytes);
}

export async function moveMidi(id: string, fromPath: string): Promise<void> {
  await mkdir(songDir(id), { recursive: true });
  await rename(fromPath, path.join(songDir(id), "notes.mid"));
}

export async function removeSongDir(id: string): Promise<void> {
  await rm(songDir(id), { recursive: true, force: true });
}

// Folder name from a title, unique among existing songs: "secunda", "secunda-2", ...
export async function uniqueSongId(title: string): Promise<string> {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "song";
  const existing = new Set(
    (await readdir(songsDir(), { withFileTypes: true }).catch(() => [])).map((e) => e.name),
  );
  if (!existing.has(base)) return base;
  for (let n = 2; ; n++) if (!existing.has(`${base}-${n}`)) return `${base}-${n}`;
}
