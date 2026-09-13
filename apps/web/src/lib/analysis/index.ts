import { countBars, type Grid } from "../grid";
import type { Note } from "../notes";
import { onsetHistogram, summariseBars, type BarSummary } from "./chords";
import { fingerprintBars, type BarFingerprints } from "./fingerprints";
import { detectScale, type Scale } from "./scale";

// Everything the player and the structure prompt derive from notes and grid.
export type NoteAnalysis = {
  totalBars: number;
  scale: Scale;
  fingerprints: BarFingerprints;
  summaries: BarSummary[];
  onsetHistogram: number[];
};

export function analyseNotes(grid: Grid, notes: readonly Note[]): NoteAnalysis {
  const totalBars = countBars(grid, notes);
  const scale = detectScale(notes);
  return {
    totalBars,
    scale,
    fingerprints: fingerprintBars(grid, notes, totalBars),
    summaries: summariseBars(grid, notes, totalBars, scale),
    onsetHistogram: onsetHistogram(grid, notes),
  };
}
