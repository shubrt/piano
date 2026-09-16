import { describe, expect, test } from "vite-plus/test";
import type { Note } from "../src/lib/notes";
import { trimForDisplay } from "../src/lib/trim";

const note = (time: number, duration: number, midi: number, hand: Note["hand"] = "left"): Note => ({
  time,
  duration,
  midi,
  velocity: 0.5,
  hand,
});

describe("trimForDisplay", () => {
  // The Dragon Quest intro: D2 rings for three seconds under an F3 D3 A2 arpeggio.
  const arpeggio = [
    note(0, 3, 50),
    note(0.45, 1, 65),
    note(0.9, 1, 62),
    note(1.35, 1, 57),
    note(1.8, 1, 65),
  ];

  test("a bass the hand cannot hold ends at the far note", () => {
    const [bass, f3] = trimForDisplay(arpeggio, false);
    expect(bass!.duration).toBeCloseTo(0.45);
    // F3 to D3 fits in one hand, so F3 keeps its length.
    expect(f3!.duration).toBe(1);
  });

  test("pedal mode ends every note at the next onset of its hand", () => {
    const trimmed = trimForDisplay(arpeggio, true);
    expect(trimmed.map((n) => Math.round(n.duration * 100))).toEqual([45, 45, 45, 45, 100]);
  });

  test("chord tones struck together and the other hand do not cut", () => {
    const notes = [note(0, 2, 48), note(0.02, 2, 55), note(0.5, 1, 72, "right")];
    const trimmed = trimForDisplay(notes, true);
    expect(trimmed[0]!.duration).toBe(2);
    expect(trimmed[1]!.duration).toBe(2);
  });

  test("a repeated pitch ends the earlier note", () => {
    const [first] = trimForDisplay([note(0, 2, 60), note(0.5, 1, 60)], false);
    expect(first!.duration).toBe(0.5);
  });
});
