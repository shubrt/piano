import { describe, expect, test } from "vite-plus/test";
import { suggestBeatsPerBar } from "../src/lib/analysis/chords";
import { fingerprintBars, letterLabel } from "../src/lib/analysis/fingerprints";
import { detectScale, scaleName } from "../src/lib/analysis/scale";
import { countBars } from "../src/lib/grid";
import { assignHands, detectHands } from "../src/lib/notes";
import { loadTestMidi } from "./fixtures";

describe("fingerprints", () => {
  test("letterLabel counts A..Z, AA, AB", () => {
    expect([0, 1, 25, 26, 27, 52].map(letterLabel)).toEqual(["A", "B", "Z", "AA", "AB", "BA"]);
  });

  test("Secunda shows the structure from the concept", () => {
    const parsed = loadTestMidi("secunda");
    const grid = { bpm: 88, beatsPerBar: 3, offsetSec: 0 };
    const notes = assignHands(parsed, { type: "split", splitPitch: 67 }, grid);
    const totalBars = countBars(grid, notes);
    expect(totalBars).toBe(34);
    expect(scaleName(detectScale(notes))).toBe("C dorisch");
    const { all } = fingerprintBars(grid, notes, totalBars);
    const groups: string[] = [];
    for (let b = 0; b < totalBars; b += 4) groups.push(all.slice(b, b + 4).join(""));
    expect(groups).toEqual(["AABC", "AABC", "DEFG", "DEFG", "DHIJ", "DHIK", "LMNO", "PQRS", "TU"]);
  });

  test("Ancient Stones parses despite the short time_signature event and detects 120 BPM in G sharp minor", () => {
    const parsed = loadTestMidi("ancient-stones");
    expect(parsed.tempoBpm).toBeNull();
    expect(detectHands(parsed)).toEqual({ type: "tracks" });
    const notes = assignHands(
      parsed,
      { type: "tracks" },
      { bpm: 120, beatsPerBar: 3, offsetSec: 0 },
    );
    expect(notes.filter((n) => n.hand === "right").length).toBe(406);
    expect(scaleName(detectScale(notes))).toBe("Gism");
    const grid = { bpm: 120, beatsPerBar: 3, offsetSec: 0 };
    const { left } = fingerprintBars(grid, notes, countBars(grid, notes));
    // Bars 9 to 11 and 13 to 15 share the left hand; the block ends differ.
    expect(left.slice(8, 11)).toEqual(left.slice(12, 15));
  });
});

describe("suggestBeatsPerBar", () => {
  test("reads the downbeat period from the histogram", () => {
    // Ancient Stones at 120 BPM: peaks every third beat.
    expect(suggestBeatsPerBar([86, 62, 59, 84, 54, 48, 80, 53, 63, 82, 48, 43])).toBe(3);
    // Peaks every fourth beat.
    expect(suggestBeatsPerBar([90, 40, 60, 40, 88, 42, 58, 41, 91, 39, 61, 40])).toBe(4);
    // Strong 1 and 7 only.
    expect(suggestBeatsPerBar([90, 30, 30, 40, 30, 30, 85, 30, 30, 40, 30, 30])).toBe(6);
  });
});
