// One-off move of song folders into Postgres, for the songs that lived in
// ~/.piano/songs before hosting. Existing ids are skipped.
//
//   DATABASE_URL=postgres://... bun scripts/import-songs.ts [dir]
import os from "node:os";
import path from "node:path";
import { createSong, songExists } from "../src/lib/storage";
import { listSongFolders } from "./song-files";

const root = process.argv[2] ?? path.join(os.homedir(), ".piano", "songs");
for (const { song, midi } of await listSongFolders(root)) {
  if (await songExists(song.id)) {
    console.log(`${song.id}: already in the database`);
    continue;
  }
  await createSong(song, midi);
  console.log(`${song.id}: imported`);
}
process.exit(0);
