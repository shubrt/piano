import { describe, expect, test } from "vite-plus/test";
import { analyseNotes } from "../src/lib/analysis";
import { assignHands } from "../src/lib/notes";
import { segmentStructure } from "../src/lib/structure/heuristic";
import { validateStructure } from "../src/lib/structure/schema";
import { loadTestMidi } from "./fixtures";

const bars = (parts: { name: string; fromBar: number; toBar: number; barsPerBlock: number }[]) =>
  parts.map((p) => `${p.name} ${p.fromBar}-${p.toBar}/${p.barsPerBlock}`);

describe("local structure heuristic", () => {
  test("Ancient Stones: bass pattern parts, the two-bar transition and octave themes", () => {
    const grid = { bpm: 120, beatsPerBar: 3, offsetSec: 0 };
    const parsed = loadTestMidi("ancient-stones");
    const analysis = analyseNotes(grid, assignHands(parsed, { type: "tracks" }, grid));
    const structure = segmentStructure(analysis, 3);
    expect(validateStructure(structure, analysis.totalBars)).toBeNull();
    expect(bars(structure.parts)).toEqual([
      "Intro 1-8/4",
      "Thema 1 9-16/4",
      "Thema 2 17-24/4",
      "Variation 25-36/4",
      "Übergang 37-38/2",
      "Thema 3 39-46/4",
      "Thema 4 47-54/4",
      "Zwischenspiel 1 55-62/4",
      "Zwischenspiel 2 63-70/4",
      "Outro 71-77/4",
    ]);
  });

  // The bass stays on D for 31 bars, so the phrases come from the right hand.
  // Opus put the closing phrase at 31-34; the heuristic keeps 31 and 32 with the
  // rising passage because their bass still follows the pattern.
  test("Secunda: phrases from right-hand repeats over a static bass", () => {
    const grid = { bpm: 88, beatsPerBar: 3, offsetSec: 0 };
    const parsed = loadTestMidi("secunda");
    const analysis = analyseNotes(
      grid,
      assignHands(parsed, { type: "split", splitPitch: 67 }, grid),
    );
    const structure = segmentStructure(analysis, 3);
    expect(validateStructure(structure, analysis.totalBars)).toBeNull();
    expect(bars(structure.parts)).toEqual([
      "Intro 1-8/4",
      "Thema 1 9-16/4",
      "Thema 2 17-24/4",
      "Thema 3 25-32/4",
      "Outro 33-34/2",
    ]);
  });
});
