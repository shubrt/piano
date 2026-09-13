import { type Grid, timeToBeat } from "../grid";
import type { Hand, Note } from "../notes";

// Every bar gets a letter per category. Equal letters mean exactly equal bars
// after quantising onsets and durations to a sixteenth grid.
export type BarFingerprints = {
  all: string[];
  left: string[];
  right: string[];
};

type Quantised = { bar: number; slot: number; duration: number; midi: number; hand: Hand };

export function quantiseNotes(grid: Grid, notes: readonly Note[]): Quantised[] {
  const slotsPerBar = grid.beatsPerBar * 4;
  return notes.map((n) => {
    const globalSlot = Math.max(0, Math.round(timeToBeat(grid, n.time) * 4));
    return {
      bar: Math.floor(globalSlot / slotsPerBar),
      slot: globalSlot % slotsPerBar,
      duration: Math.max(1, Math.round((n.duration / (60 / grid.bpm)) * 4)),
      midi: n.midi,
      hand: n.hand,
    };
  });
}

export function fingerprintBars(
  grid: Grid,
  notes: readonly Note[],
  totalBars: number,
): BarFingerprints {
  const quantised = quantiseNotes(grid, notes);
  const keys = {
    all: emptyBars(totalBars),
    left: emptyBars(totalBars),
    right: emptyBars(totalBars),
  };
  for (const q of quantised) {
    if (q.bar >= totalBars) continue;
    const key = `${q.slot}:${q.midi}:${q.duration}:${q.hand}`;
    keys.all[q.bar]!.push(key);
    keys[q.hand][q.bar]!.push(key);
  }
  return {
    all: letterize(keys.all),
    left: letterize(keys.left),
    right: letterize(keys.right),
  };
}

function emptyBars(totalBars: number): string[][] {
  return Array.from({ length: totalBars }, () => []);
}

// Same sorted key set gets the same letter, in order of first appearance.
function letterize(bars: string[][]): string[] {
  const labels = new Map<string, string>();
  return bars.map((keys) => {
    const fingerprint = keys.sort().join("|");
    let label = labels.get(fingerprint);
    if (label === undefined) {
      label = letterLabel(labels.size);
      labels.set(fingerprint, label);
    }
    return label;
  });
}

// 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, ...
export function letterLabel(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
