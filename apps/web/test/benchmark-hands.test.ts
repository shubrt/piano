import { describe, expect, test } from "vite-plus/test";
import { lintHands, noteNumber, scoreLabels } from "../src/lib/benchmark-hands";
import type { Note } from "../src/lib/notes";

const grid = { bpm: 120, beatsPerBar: 4, offsetSec: 0 };
const beat = (b: number) => (b * 60) / grid.bpm;
const note = (b: number, midi: number, hand: Note["hand"], durationBeats = 0.5): Note => ({
  time: beat(b),
  duration: beat(durationBeats),
  midi,
  velocity: 0.8,
  hand,
});

describe("scoreLabels", () => {
  test("counts notes whose hand differs from the labelled left pitches", () => {
    const notes = [
      note(0, 55, "left"),
      note(1, 59, "left"),
      note(2, 64, "right"),
      note(2, 81, "right"),
    ];
    const [bar] = scoreLabels(grid, notes, { bars: { "1": ["G3", "B3", "E4"] } });
    expect(bar).toMatchObject({ bar: 1, total: 4 });
    expect(bar!.mistakes).toEqual([{ beat: 2, midi: 64, expected: "left", actual: "right" }]);
  });

  test("reads sharps, flats and plain numbers", () => {
    expect(noteNumber("G#3")).toBe(56);
    expect(noteNumber("Ab3")).toBe(56);
    expect(noteNumber("56")).toBe(56);
    expect(noteNumber("C-1")).toBe(0);
  });
});

describe("lintHands", () => {
  test("flags a grip wider than a hand even for very short notes", () => {
    // 50 ms notes struck 20 ms apart in the same hand, 17 semitones apart.
    const notes = [
      { ...note(2, 64, "right"), duration: 0.05 },
      { ...note(2, 81, "right"), time: beat(2) + 0.02, duration: 0.05 },
    ];
    expect(lintHands(grid, notes)).toEqual([
      { kind: "span", bar: 1, count: 1, example: "E4 und A5 zusammen rechts" },
    ]);
  });

  test("flags a fast jump and a repeated bar with other hands, not a calm one", () => {
    const calm = [
      note(0, 48, "left"),
      note(1, 52, "left"),
      note(2, 55, "left"),
      note(0, 72, "right"),
    ];
    expect(lintHands(grid, calm)).toEqual([]);

    // A fast arpeggio covers two octaves in small steps, no jump.
    const arpeggio = [60, 64, 67, 72, 76, 79, 84].map((midi, i) => ({
      ...note(0, midi, "right"),
      time: i * 0.04,
    }));
    expect(lintHands(grid, arpeggio)).toEqual([]);

    const jump: Note[] = [note(0, 52, "left"), { ...note(0, 37, "left"), time: beat(0) + 0.09 }];
    expect(lintHands(grid, jump).map((f) => f.kind)).toEqual(["jump"]);

    // Bars 1 and 2 have the same notes, bar 2 puts E4 in the other hand.
    const repeated = [
      note(0, 50, "left"),
      note(1, 64, "left"),
      note(4, 50, "left"),
      note(5, 64, "right"),
    ];
    expect(lintHands(grid, repeated)).toEqual([
      { kind: "inconsistent", bar: 2, count: 1, example: "gleiche Noten wie Takt 1, andere Hände" },
    ]);
  });
});
