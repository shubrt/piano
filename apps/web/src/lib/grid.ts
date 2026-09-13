// The bar grid: bar n starts at offsetSec + (n - 1) * beatsPerBar * 60 / bpm.
// Player positions are beats relative to the start of bar 1.

export type Grid = { bpm: number; beatsPerBar: number; offsetSec: number };

export function beatSeconds(grid: Grid): number {
  return 60 / grid.bpm;
}

export function timeToBeat(grid: Grid, time: number): number {
  return (time - grid.offsetSec) / beatSeconds(grid);
}

export function beatToTime(grid: Grid, beat: number): number {
  return grid.offsetSec + beat * beatSeconds(grid);
}

// 1-based bar number of a beat position. Notes slightly before beat 0 land in bar 1.
export function barOfBeat(grid: Grid, beat: number): number {
  return Math.max(1, Math.floor(beat / grid.beatsPerBar) + 1);
}

export function barStartBeat(grid: Grid, bar: number): number {
  return (bar - 1) * grid.beatsPerBar;
}

// Number of bars up to the last note onset. Releases that ring into an empty
// bar do not add a bar, nobody practises silence.
export function countBars(grid: Grid, notes: readonly { time: number }[]): number {
  let last = 0;
  for (const n of notes) last = Math.max(last, timeToBeat(grid, n.time));
  return Math.max(1, Math.floor(last / grid.beatsPerBar + 1e-6) + 1);
}
