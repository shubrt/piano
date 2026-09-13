"use client";

import { useState } from "react";
import { BEATS_PER_BAR, type Song, type SongPatch } from "@/lib/song";

type Props = {
  song: Song;
  onPatch: (patch: SongPatch) => Promise<void>;
  onReanalyze: () => Promise<void>;
};

// BPM, time signature, offset and split pitch. Every change moves the grid at
// once and is saved. "Struktur neu" asks the model again with that grid.
export function Corrections({ song, onPatch, onReanalyze }: Props) {
  const [busy, setBusy] = useState(false);

  const number = (value: string) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="fields mono">
      <label>
        BPM
        <input
          type="number"
          step="0.5"
          min="20"
          max="300"
          defaultValue={song.bpm}
          key={`bpm-${song.bpm}`}
          onBlur={(e) => {
            const bpm = number(e.target.value);
            if (bpm && bpm > 0 && bpm !== song.bpm) void onPatch({ bpm });
          }}
        />
      </label>
      <label>
        Takt
        <select
          value={song.beatsPerBar}
          onChange={(e) => {
            const beatsPerBar = Number(e.target.value);
            if (beatsPerBar === 3 || beatsPerBar === 4 || beatsPerBar === 6)
              void onPatch({ beatsPerBar });
          }}
        >
          {BEATS_PER_BAR.map((n) => (
            <option key={n} value={n}>
              {n}/4
            </option>
          ))}
        </select>
      </label>
      <label>
        Versatz
        <input
          type="number"
          step="0.01"
          defaultValue={song.offsetSec.toFixed(2)}
          key={`offset-${song.offsetSec}`}
          onBlur={(e) => {
            const offsetSec = number(e.target.value);
            if (offsetSec !== null && offsetSec !== song.offsetSec) void onPatch({ offsetSec });
          }}
        />
        s
      </label>
      {song.hands.type === "split" ? (
        <label>
          Split
          <input
            type="number"
            min="21"
            max="108"
            defaultValue={song.hands.splitPitch}
            key={`split-${song.hands.splitPitch}`}
            onBlur={(e) => {
              const splitPitch = number(e.target.value);
              if (
                splitPitch !== null &&
                song.hands.type === "split" &&
                splitPitch !== song.hands.splitPitch
              ) {
                void onPatch({ hands: { type: "split", splitPitch: Math.round(splitPitch) } });
              }
            }}
          />
        </label>
      ) : null}
      <button
        type="button"
        disabled={busy}
        title={
          song.analysis?.error ? `Letzte Analyse: ${song.analysis.error}` : song.analysis?.notes
        }
        onClick={async () => {
          setBusy(true);
          try {
            await onReanalyze();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Analyse läuft" : "Struktur neu"}
      </button>
    </div>
  );
}
