import { type Grid, timeToBeat } from "./grid";
import type { MidiTrack, ParsedMidi } from "./midi";
import type { Hands } from "./song";

export type Hand = "left" | "right";

export type Note = {
  time: number;
  duration: number;
  midi: number;
  velocity: number;
  hand: Hand;
};

// Several tracks with notes: hands come from the tracks. One track: split per bar.
export function detectHands(parsed: ParsedMidi): Hands {
  return parsed.tracks.length >= 2 ? { type: "tracks" } : { type: "auto" };
}

export function allOnsets(parsed: ParsedMidi): number[] {
  return parsed.tracks.flatMap((t) => t.notes.map((n) => n.time));
}

export function assignHands(parsed: ParsedMidi, hands: Hands, grid: Grid): Note[] {
  const notes: Note[] = [];
  if (hands.type === "tracks" && parsed.tracks.length >= 2) {
    // The two busiest tracks are the hands. Their mean pitches define a midpoint;
    // any extra track (ornaments, pedal notes) joins the side its mean pitch falls on.
    const [a, b] = [...parsed.tracks].sort((x, y) => y.notes.length - x.notes.length) as [
      MidiTrack,
      MidiTrack,
    ];
    const midpoint = (meanPitch(a) + meanPitch(b)) / 2;
    for (const track of parsed.tracks) {
      const hand: Hand = meanPitch(track) >= midpoint ? "right" : "left";
      for (const n of track.notes) notes.push({ ...n, hand });
    }
  } else if (hands.type === "split") {
    for (const track of parsed.tracks) {
      for (const n of track.notes)
        notes.push({ ...n, hand: n.midi < hands.splitPitch ? "left" : "right" });
    }
  } else {
    const flat = parsed.tracks.flatMap((t) => t.notes);
    const split = splitPerBar(flat, grid);
    for (const n of flat) {
      const bar = Math.max(0, Math.floor(timeToBeat(grid, n.time) / grid.beatsPerBar + 1e-6));
      notes.push({ ...n, hand: n.midi < (split[bar] ?? DEFAULT_SPLIT) ? "left" : "right" });
    }
  }
  return notes.sort((x, y) => x.time - y.time || x.midi - y.midi);
}

const DEFAULT_SPLIT = 60;
// A gap between the hands is at least a fourth.
const MIN_GAP = 5;

// Split pitch per bar: the gap between the two pitch clusters of the bar that
// lies closest to the previous bar's split, then a median over three bars so
// the boundary does not jump. Bars with one cluster inherit their neighbours.
export function splitPerBar(
  notes: readonly { time: number; midi: number }[],
  grid: Grid,
): number[] {
  const perBar: number[][] = [];
  for (const n of notes) {
    const bar = Math.max(0, Math.floor(timeToBeat(grid, n.time) / grid.beatsPerBar + 1e-6));
    (perBar[bar] ??= []).push(n.midi);
  }
  const raw: (number | null)[] = [];
  let previous = DEFAULT_SPLIT;
  for (let bar = 0; bar < perBar.length; bar++) {
    const pitches = [...new Set(perBar[bar] ?? [])].sort((a, b) => a - b);
    let best: number | null = null;
    for (let i = 1; i < pitches.length; i++) {
      const low = pitches[i - 1]!;
      const high = pitches[i]!;
      if (high - low < MIN_GAP) continue;
      const mid = (low + high) / 2;
      if (best === null || Math.abs(mid - previous) < Math.abs(best - previous)) best = mid;
    }
    raw.push(best);
    if (best !== null) previous = best;
  }
  // Fill single-cluster bars from the nearest decided bar, then smooth.
  const filled = raw.map((v, i) => v ?? nearest(raw, i) ?? DEFAULT_SPLIT);
  return filled.map((_, i) => {
    const window = [filled[i - 1], filled[i], filled[i + 1]].filter(
      (v): v is number => v !== undefined,
    );
    return window.sort((a, b) => a - b)[Math.floor(window.length / 2)]!;
  });
}

function nearest(values: readonly (number | null)[], index: number): number | null {
  for (let d = 1; d < values.length; d++) {
    const before = values[index - d];
    if (before !== null && before !== undefined) return before;
    const after = values[index + d];
    if (after !== null && after !== undefined) return after;
  }
  return null;
}

function meanPitch(track: MidiTrack): number {
  return track.notes.reduce((sum, n) => sum + n.midi, 0) / track.notes.length;
}
