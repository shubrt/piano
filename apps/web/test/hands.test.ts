import { describe, expect, test } from "vite-plus/test";
import { splitPerBar } from "../src/lib/notes";

const grid = { bpm: 120, beatsPerBar: 4, offsetSec: 0 };
const beat = (b: number) => (b * 60) / grid.bpm;

describe("splitPerBar", () => {
  test("follows the hands when both move down an octave", () => {
    const notes: { time: number; midi: number }[] = [];
    // Bars 1 and 2: left around C3, right around C5. Bars 3 and 4: an octave lower.
    for (let bar = 0; bar < 4; bar++) {
      const shift = bar < 2 ? 0 : -12;
      for (let b = 0; b < 4; b++) {
        notes.push({ time: beat(bar * 4 + b), midi: 48 + shift + (b % 2) * 7 });
        notes.push({ time: beat(bar * 4 + b), midi: 72 + shift + b });
      }
    }
    const split = splitPerBar(notes, grid);
    expect(split[0]).toBeGreaterThan(55);
    expect(split[0]).toBeLessThan(72);
    expect(split[3]).toBeGreaterThan(43);
    expect(split[3]).toBeLessThan(60);
  });

  test("a bar with one hand inherits the split of its neighbours", () => {
    const notes = [
      { time: beat(0), midi: 48 },
      { time: beat(0), midi: 76 },
      // Bar 2: only the right hand, low but above the previous split.
      { time: beat(4), midi: 64 },
      { time: beat(5), midi: 65 },
      { time: beat(8), midi: 48 },
      { time: beat(8), midi: 76 },
    ];
    const split = splitPerBar(notes, grid);
    expect(split[1]).toBe(split[0]);
    expect(64).toBeGreaterThanOrEqual(split[1]!);
  });
});
