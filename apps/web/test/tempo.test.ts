import { describe, expect, test } from "vite-plus/test";
import { detectTempo } from "../src/lib/analysis/tempo";

// Onsets on a sixteenth grid at the given tempo, starting at `start`.
function onsets(bpm: number, start: number, sixteenths: number[]): number[] {
  return sixteenths.map((s) => start + (s * 15) / bpm);
}

describe("detectTempo", () => {
  test("finds an exact grid and the first onset as offset", () => {
    const result = detectTempo(onsets(120, 0.42, [0, 2, 4, 6, 8, 9, 10, 12, 16, 20, 24]));
    expect(result.bpm).toBe(120);
    expect(result.offsetSec).toBeCloseTo(0.42, 6);
  });

  test("prefers the tempo nearest 100 when halves and doubles fit equally", () => {
    // Only eighth notes: 60 and 120 fit equally well. 120 is the sensible pick.
    expect(detectTempo(onsets(120, 0, [0, 2, 4, 6, 8, 10, 12, 14, 16])).bpm).toBe(120);
    // Only sixteenths at a slow tempo: 176 fits too but lies outside 60 to 140.
    expect(detectTempo(onsets(88, 0, [0, 1, 2, 3, 4, 6, 8, 12])).bpm).toBe(88);
  });

  test("survives millisecond jitter", () => {
    const jittered = onsets(88, 1, [0, 1, 3, 4, 6, 8, 12, 13, 16, 20]).map(
      (t, i) => t + (i % 2 ? 0.003 : -0.002),
    );
    expect(detectTempo(jittered).bpm).toBe(88);
  });
});
