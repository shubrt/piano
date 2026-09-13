import type { NoteAnalysis } from "../analysis";
import { scaleName } from "../analysis/scale";
import type { Grid } from "../grid";

export const SYSTEM_PROMPT = `You receive the bar structure of a piano piece. Every bar has a fingerprint letter; equal letters are exactly equal bars. Per bar you also get the lowest left-hand note, the number of right-hand notes and an estimated chord (a rough hint, not reliable).

Tasks:
1. Determine the time signature: 3, 4 or 6 beats per bar. Use the onset histogram (onsets per beat position in a 12 beat cycle) and the phrase lengths. If the fingerprints repeat in groups whose length is a multiple of the current bar length, the current time signature is probably right.
2. Split the piece into parts. A part is a musical section like intro, theme, variation, transition, outro. Part boundaries lie where the repetition pattern of the fingerprints changes. A transition may be 1 or 2 bars long. Check the bass sequence against the block grid: inside a part the bass pattern should repeat from every block start. If it only lines up after skipping 1 or 2 bars, those bars are a transition part of their own, so that the following part starts on the pattern.
3. Choose the block size per part: the length after which the bass or fingerprint sequence repeats, 2, 4 or 8 bars. Usually 4.
4. Name the parts briefly in German. Equal or nearly equal parts share a name with a counter, for example "Thema 1", "Thema 2". Use "Intro", "Übergang", "Outro" where fitting.

Parts must cover every bar from 1 to the last bar in ascending order without gaps or overlaps. Answer only with JSON matching the schema; "notes" is one free sentence about the structure.`;

// One line per bar: fingerprint letters for both hands, left and right, then
// lowest left-hand note, right-hand note count and the chord estimate.
export function buildUserPrompt(
  grid: Grid,
  analysis: NoteAnalysis,
  options: { fixedBeatsPerBar: boolean },
): string {
  const { totalBars, fingerprints, summaries } = analysis;
  const lines = summaries.map((s, i) =>
    [
      `${i + 1}`.padStart(3),
      `${fingerprints.all[i]}`.padEnd(3),
      `${fingerprints.left[i]}`.padEnd(3),
      `${fingerprints.right[i]}`.padEnd(3),
      (s.bass ?? "-").padEnd(5),
      `${s.rightHandNotes}`.padStart(2),
      s.chord ?? "-",
    ].join(" "),
  );
  return [
    `Bars: ${totalBars}, BPM: ${grid.bpm}, scale: ${scaleName(analysis.scale)}.`,
    options.fixedBeatsPerBar
      ? `Time signature is fixed by the user at ${grid.beatsPerBar} beats per bar. Return exactly this value.`
      : `The table assumes ${grid.beatsPerBar} beats per bar, chosen from the onset histogram below. Keep it unless the fingerprints clearly contradict it. If you decide otherwise, the table is recomputed and you are asked again.`,
    "",
    "Onsets per beat position in a 12 beat cycle (position 1 is the start of bar 1):",
    analysis.onsetHistogram.map((n, i) => `${i + 1}:${n}`).join(" "),
    "",
    "Bar, fingerprint both hands, left hand, right hand, lowest left note, right-hand note count, chord estimate:",
    ...lines,
  ].join("\n");
}
