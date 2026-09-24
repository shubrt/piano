"use client";

import Link from "next/link";
import { useState } from "react";
import type { Song } from "@/lib/song";
import { AiButton } from "./ai-button";
import { DeleteButton } from "./delete-button";
import { SourceLink } from "./source-link";

export type SongRow = { song: Song; scale: string; bars: number; ai: boolean };

// Song table with a search field. Every word of the query has to appear in the
// title or the scale, ignoring case and accents.
export function SongList({ rows }: { rows: SongRow[] }) {
  const [query, setQuery] = useState("");
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const visible = rows.filter(({ song, scale }) => {
    const text = normalize(`${song.title} ${scale}`);
    return words.every((word) => text.includes(word));
  });

  return (
    <>
      <div className="songs-head">
        <h2>Songs</h2>
        {rows.length > 0 ? (
          <>
            <input
              type="search"
              placeholder="Suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="dim">
              {words.length > 0 ? `${visible.length} / ${rows.length}` : rows.length}
            </span>
          </>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="dim">
          Noch keine Songs. URL importieren oder eine MIDI-Datei hierher ziehen.
        </p>
      ) : null}
      <table className="songs">
        <tbody>
          {visible.map(({ song, scale, bars, ai }) => (
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
                {ai ? " KI" : ""}
                {song.analysis?.error ? " ⚠" : ""}
              </td>
              <td>
                <AiButton id={song.id} />
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
    </>
  );
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
