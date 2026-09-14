import type { Part } from "./song";
import type { BarFingerprints } from "./analysis/fingerprints";

export type Block = {
  partIndex: number;
  // 1-based within the part.
  index: number;
  fromBar: number;
  toBar: number;
};

export type BlockRepeat = {
  // Index of the earlier block in the same part this one repeats, per category.
  all: number | null;
  left: number | null;
  right: number | null;
};

// Without parts the whole song is one part named Song.
export function effectiveParts(parts: readonly Part[], totalBars: number): Part[] {
  const clipped = parts
    .filter((p) => p.fromBar <= totalBars)
    .map((p) => ({ ...p, toBar: Math.min(p.toBar, totalBars) }));
  return clipped.length > 0
    ? clipped
    : [{ name: "Song", fromBar: 1, toBar: totalBars, barsPerBlock: 4 }];
}

// Splits a part into blocks of barsPerBlock bars; the last one may be shorter.
export function blocksOfPart(part: Part, partIndex: number): Block[] {
  const blocks: Block[] = [];
  for (let from = part.fromBar, index = 1; from <= part.toBar; from += part.barsPerBlock, index++) {
    blocks.push({
      partIndex,
      index,
      fromBar: from,
      toBar: Math.min(from + part.barsPerBlock - 1, part.toBar),
    });
  }
  return blocks;
}

// A block repeats an earlier block of the same part when their bar letter
// sequences match exactly. Checked for both hands together and per hand.
export function blockRepeats(
  blocks: readonly Block[],
  fingerprints: BarFingerprints,
): BlockRepeat[] {
  const sequence = (letters: readonly string[], block: Block) =>
    letters.slice(block.fromBar - 1, block.toBar).join(" ");
  return blocks.map((block) => {
    const result: BlockRepeat = { all: null, left: null, right: null };
    for (const category of ["all", "left", "right"] as const) {
      const mine = sequence(fingerprints[category], block);
      const earlier = blocks.find(
        (other) =>
          other.partIndex === block.partIndex &&
          other.index < block.index &&
          sequence(fingerprints[category], other) === mine,
      );
      result[category] = earlier?.index ?? null;
    }
    return result;
  });
}
