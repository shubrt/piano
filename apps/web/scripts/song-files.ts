import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { type Song, SongSchema } from "../src/lib/song";

// Songs as folders, the format the app used before Postgres: <dir>/<id>/notes.mid
// plus song.json. The benchmarks still read references and labels from here,
// and import-songs.ts moves such folders into the database.
export type SongFolder = { song: Song; midi: Uint8Array; dir: string };

export async function listSongFolders(root: string): Promise<SongFolder[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const folders: SongFolder[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    try {
      const song = SongSchema.parse(
        JSON.parse(await readFile(path.join(dir, "song.json"), "utf8")),
      );
      const midi = new Uint8Array(await readFile(path.join(dir, "notes.mid")));
      folders.push({ song, midi, dir });
    } catch (error) {
      console.warn(`Skipping song folder ${entry.name}:`, error);
    }
  }
  return folders.sort((a, b) => a.song.title.localeCompare(b.song.title, "de"));
}
