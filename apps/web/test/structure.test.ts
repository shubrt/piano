import { describe, expect, test } from "vite-plus/test";
import { fallbackStructure, StructureSchema, validateStructure } from "../src/lib/structure/schema";

describe("structure validation", () => {
  const part = (name: string, fromBar: number, toBar: number) => ({
    name,
    fromBar,
    toBar,
    barsPerBlock: 4 as const,
  });

  test("accepts gapless ascending parts", () => {
    expect(
      validateStructure(
        { beatsPerBar: 3, parts: [part("Intro", 1, 8), part("Thema", 9, 34)], notes: "" },
        34,
      ),
    ).toBeNull();
  });

  test("rejects gaps, overlaps and a wrong end", () => {
    expect(
      validateStructure(
        { beatsPerBar: 3, parts: [part("A", 1, 8), part("B", 10, 34)], notes: "" },
        34,
      ),
    ).toMatch(/starts at bar 10/);
    expect(
      validateStructure(
        { beatsPerBar: 3, parts: [part("A", 1, 8), part("B", 8, 34)], notes: "" },
        34,
      ),
    ).toMatch(/starts at bar 8/);
    expect(validateStructure({ beatsPerBar: 3, parts: [part("A", 1, 30)], notes: "" }, 34)).toMatch(
      /has 34 bars/,
    );
  });

  test("schema rejects unknown block sizes and time signatures", () => {
    expect(
      StructureSchema.safeParse({ beatsPerBar: 5, parts: [part("A", 1, 4)], notes: "" }).success,
    ).toBe(false);
    expect(
      StructureSchema.safeParse({
        beatsPerBar: 4,
        parts: [{ ...part("A", 1, 4), barsPerBlock: 3 }],
        notes: "",
      }).success,
    ).toBe(false);
  });

  test("fallback is one part over the whole song", () => {
    expect(fallbackStructure(4, 20).parts).toEqual([
      { name: "Song", fromBar: 1, toBar: 20, barsPerBlock: 4 },
    ]);
  });
});
