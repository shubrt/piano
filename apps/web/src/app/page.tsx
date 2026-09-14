import Link from "next/link";
import { analyseNotes } from "@/lib/analysis";
import { scaleName } from "@/lib/analysis/scale";
import { parseMidi } from "@/lib/midi";
import { assignHands } from "@/lib/notes";
import type { Song } from "@/lib/song";
import { listSongs, readMidi } from "@/lib/storage";
import { DeleteButton } from "./delete-button";
import { ImportPanel } from "./import-panel";
import { SourceLink } from "./source-link";

export const dynamic = "force-dynamic";

type Row = { song: Song; scale: string; bars: number };

async function loadRows(): Promise<Row[]> {
  const songs = await listSongs();
  return Promise.all(
    songs.map(async (song) => {
      const notes = assignHands(parseMidi(await readMidi(song.id)), song.hands, song);
      const analysis = analyseNotes(song, notes);
      return { song, scale: scaleName(analysis.scale), bars: analysis.totalBars };
    }),
  );
}

export default async function HomePage() {
  const rows = await loadRows();
  return (
    <ImportPanel>
      <h2>Songs</h2>
      {rows.length === 0 ? (
        <p className="dim">
          Noch keine Songs. URL importieren oder eine MIDI-Datei hierher ziehen.
        </p>
      ) : null}
      <table className="songs">
        <tbody>
          {rows.map(({ song, scale, bars }) => (
            <tr key={song.id}>
              <td>
                <Link href={`/songs/${song.id}`}>{song.title}</Link>
              </td>
              <td>{scale}</td>
              <td>{song.beatsPerBar}/4</td>
              <td className="num">{song.bpm}</td>
              <td className="num">{bars} Takte</td>
              <td className="num" title={song.analysis?.notes ?? song.analysis?.error}>
                {song.parts.length > 0 ? `${song.parts.length} Parts` : "ohne Struktur"}
                {song.analysis?.error ? " ⚠" : ""}
              </td>
              <td>
                <SourceLink source={song.source} />
              </td>
              <td>
                <DeleteButton id={song.id} title={song.title} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ImportPanel>
  );
}
