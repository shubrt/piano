import { analyseNotes } from "@/lib/analysis";
import { scaleName } from "@/lib/analysis/scale";
import { parseMidi } from "@/lib/midi";
import { assignHands } from "@/lib/notes";
import { listSongs, readMidi } from "@/lib/storage";
import { LOCAL_MODEL } from "@/lib/structure/detect";
import { ImportPanel } from "./import-panel";
import { SongList, type SongRow } from "./song-list";

export const dynamic = "force-dynamic";

async function loadRows(): Promise<SongRow[]> {
  const songs = await listSongs();
  return Promise.all(
    songs.map(async (song) => {
      const notes = assignHands(parseMidi(await readMidi(song.id)), song.hands);
      const analysis = analyseNotes(song, notes);
      return {
        song,
        scale: scaleName(analysis.scale),
        bars: analysis.totalBars,
        ai: Boolean(song.analysis && song.analysis.model !== LOCAL_MODEL),
      };
    }),
  );
}

export default async function HomePage() {
  const rows = await loadRows();
  return (
    <ImportPanel>
      <SongList rows={rows} />
    </ImportPanel>
  );
}
