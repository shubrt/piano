import { describe, expect, test } from "vite-plus/test";
import { blockRepeats, blocksOfPart, effectiveParts } from "../src/lib/blocks";

describe("blocks", () => {
  test("splits a part into blocks, last one shorter", () => {
    expect(blocksOfPart({ name: "Outro", fromBar: 29, toBar: 34, barsPerBlock: 4 }, 4)).toEqual([
      { partIndex: 4, index: 1, fromBar: 29, toBar: 32 },
      { partIndex: 4, index: 2, fromBar: 33, toBar: 34 },
    ]);
  });

  test("without parts the song is one part", () => {
    expect(effectiveParts([], 12)).toEqual([
      { name: "Song", fromBar: 1, toBar: 12, barsPerBlock: 4 },
    ]);
    expect(effectiveParts([{ name: "A", fromBar: 1, toBar: 20, barsPerBlock: 4 }], 12)).toEqual([
      { name: "A", fromBar: 1, toBar: 12, barsPerBlock: 4 },
    ]);
  });

  test("marks repeats per hand within a part", () => {
    const blocks = blocksOfPart({ name: "P", fromBar: 1, toBar: 8, barsPerBlock: 4 }, 0);
    const fingerprints = {
      all: ["A", "B", "C", "D", "A", "B", "C", "E"],
      left: ["A", "A", "B", "C", "A", "A", "B", "C"],
      right: ["A", "B", "C", "D", "A", "B", "C", "E"],
    };
    expect(blockRepeats(blocks, fingerprints)).toEqual([
      { all: null, left: null, right: null },
      { all: null, left: 1, right: null },
    ]);
  });
});
