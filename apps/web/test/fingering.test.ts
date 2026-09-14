import { describe, expect, test } from "vite-plus/test";
import { assignFingering } from "../src/lib/fingering";
import type { Note } from "../src/lib/notes";

const melody = (hand: Note["hand"], pitches: number[], step = 0.5): Note[] =>
  pitches.map((midi, i) => ({ time: i * step, duration: step * 0.9, midi, velocity: 0.8, hand }));

describe("assignFingering", () => {
  test("C major scale up and down in the right hand", () => {
    const up = melody("right", [60, 62, 64, 65, 67, 69, 71, 72]);
    expect(assignFingering(up)).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    const down = melody("right", [72, 71, 69, 67, 65, 64, 62, 60]);
    expect(assignFingering(down)).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });

  test("C major scale down in the left hand mirrors the right", () => {
    const down = melody("left", [60, 59, 57, 55, 53, 52, 50, 48]);
    expect(assignFingering(down)).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
  });

  test("triads take 1 3 5", () => {
    const chord: Note[] = [60, 64, 67].map((midi) => ({
      time: 0,
      duration: 1,
      midi,
      velocity: 0.8,
      hand: "right",
    }));
    expect(assignFingering(chord)).toEqual([1, 3, 5]);
    const left: Note[] = [48, 52, 55].map((midi) => ({
      time: 0,
      duration: 1,
      midi,
      velocity: 0.8,
      hand: "left",
    }));
    expect(assignFingering(left)).toEqual([5, 3, 1]);
  });

  test("hands are fingered independently and stay aligned with the input", () => {
    const notes: Note[] = [
      { time: 0, duration: 0.4, midi: 48, velocity: 0.8, hand: "left" },
      { time: 0, duration: 0.4, midi: 72, velocity: 0.8, hand: "right" },
      { time: 0.5, duration: 0.4, midi: 74, velocity: 0.8, hand: "right" },
    ];
    const fingers = assignFingering(notes);
    expect(fingers).toHaveLength(3);
    expect(fingers.every((f) => f !== undefined)).toBe(true);
  });
});
