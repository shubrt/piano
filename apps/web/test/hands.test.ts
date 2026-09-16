import { describe, expect, test } from "vite-plus/test";
import { assignAuto } from "../src/lib/hands";

// Beats at 120 BPM.
const beat = (b: number) => b / 2;
const at = (b: number, midi: number) => ({ time: beat(b), midi });

describe("assignAuto", () => {
  test("follows the hands when both move down an octave", () => {
    const notes: { time: number; midi: number }[] = [];
    for (let bar = 0; bar < 4; bar++) {
      const shift = bar < 2 ? 0 : -12;
      for (let b = 0; b < 4; b++) {
        notes.push(at(bar * 4 + b, 48 + shift + (b % 2) * 7));
        notes.push(at(bar * 4 + b, 72 + shift + b));
      }
    }
    // Notes were pushed in pairs, lower voice first.
    const hands = assignAuto(notes);
    hands.forEach((hand, i) => expect(hand).toBe(i % 2 === 0 ? "left" : "right"));
  });

  test("an arpeggio stays in the left hand under a right-hand chord", () => {
    // G3 B3 E4 on the beats, the right hand plays G5 and A5 above. E4 sounds
    // with A5, 17 semitones apart, so it cannot be right.
    const notes = [
      at(0, 55),
      at(0, 79),
      at(1, 59),
      at(1, 79),
      { time: beat(2), midi: 64 },
      { time: beat(2) + 0.02, midi: 81 },
      at(3, 48),
    ];
    expect(assignAuto(notes)).toEqual(["left", "right", "left", "right", "left", "right", "left"]);
  });

  test("a slow lone line stays in one hand even when it climbs past the middle", () => {
    // D3 F4 D4 A3 twice, nothing else. One hand plays it.
    const line = [50, 65, 62, 57, 50, 65, 62, 57].map((midi, i) => ({ time: i * 0.4, midi }));
    const hands = assignAuto(line);
    expect(new Set(hands).size).toBe(1);
  });

  test("fast alternating bass and arpeggio split by register, not by order", () => {
    // Bass C#2/G#2 every 160 ms, arpeggio sixteenths C#3 E3 G#3 C#4 in between.
    // G#2 lies within reach of both hands and is not asserted.
    const notes: { time: number; midi: number }[] = [];
    const bass = [37, 44];
    const arpeggio = [49, 52, 56, 61];
    for (let i = 0; i < 16; i++) {
      notes.push({ time: i * 0.16, midi: bass[i % 2]! });
      notes.push({ time: i * 0.16 + 0.08, midi: arpeggio[i % 4]! });
    }
    const hands = assignAuto(notes);
    notes.forEach((n, i) => {
      if (n.midi === 37) expect(hands[i]).toBe("left");
      if (n.midi >= 49) expect(hands[i]).toBe("right");
    });
  });
});
