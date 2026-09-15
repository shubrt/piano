import type { Grid } from "../grid";
import type { Note } from "../notes";
import { quantiseNotes } from "./fingerprints";
import { noteName, pitchClassName, type Scale } from "./scale";

// Per bar facts for the structure prompt. The chord is an approximation: root is
// the lowest left-hand note, quality from the third present in the bar, else
// diatonic from the scale. The model treats it as a hint only.
export type BarSummary = {
  bass: string | null;
  // MIDI pitch of the lowest left-hand note, for the local structure heuristic.
  bassMidi: number | null;
  rightHandNotes: number;
  chord: string | null;
};

export function summariseBars(
  grid: Grid,
  notes: readonly Note[],
  totalBars: number,
  scale: Scale,
): BarSummary[] {
  const quantised = quantiseNotes(grid, notes);
  const bars = Array.from({ length: totalBars }, () => ({
    lowestLeft: Infinity,
    rightHandNotes: 0,
    pcs: new Set<number>(),
  }));
  for (const q of quantised) {
    const bar = bars[q.bar];
    if (!bar) continue;
    bar.pcs.add(q.midi % 12);
    if (q.hand === "left") bar.lowestLeft = Math.min(bar.lowestLeft, q.midi);
    else bar.rightHandNotes += 1;
  }
  return bars.map((bar) => {
    if (bar.lowestLeft === Infinity)
      return { bass: null, bassMidi: null, rightHandNotes: bar.rightHandNotes, chord: null };
    const root = bar.lowestLeft % 12;
    const quality = bar.pcs.has((root + 3) % 12)
      ? "m"
      : bar.pcs.has((root + 4) % 12)
        ? ""
        : scale.pitchClasses.has((root + 3) % 12)
          ? "m"
          : scale.pitchClasses.has((root + 4) % 12)
            ? ""
            : "?";
    return {
      bass: noteName(bar.lowestLeft, scale),
      bassMidi: bar.lowestLeft,
      rightHandNotes: bar.rightHandNotes,
      chord: pitchClassName(root, scale) + quality,
    };
  });
}

// Onset count per beat position inside a 12 beat cycle, the common multiple of
// 3, 4 and 6. Helps the model decide the time signature.
export function onsetHistogram(grid: Grid, notes: readonly Note[]): number[] {
  const histogram = Array.from({ length: 12 }, () => 0);
  const beatsPerBar = 12;
  for (const n of quantiseNotes({ ...grid, beatsPerBar }, notes)) {
    histogram[Math.floor(n.slot / 4)]! += 1;
  }
  return histogram;
}

// Picks the time signature whose downbeats carry the most onsets in the 12 beat
// histogram. 6 only wins over 3 with a clear margin, since its downbeats are a
// subset of the 3/4 downbeats. The model may still override this.
export function suggestBeatsPerBar(histogram: readonly number[]): 3 | 4 | 6 {
  const score = (n: number) => {
    const downbeats = histogram.filter((_, i) => i % n === 0);
    return downbeats.reduce((a, b) => a + b, 0) / downbeats.length;
  };
  const three = score(3);
  const four = score(4);
  const six = score(6);
  if (four > three && four > six) return 4;
  return six > three * 1.15 ? 6 : 3;
}
