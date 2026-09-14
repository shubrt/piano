import { z } from "zod";
import { BEATS_PER_BAR, PartSchema } from "../song";

// What the model returns. Parts must cover bar 1 to the last bar without gaps.
export const StructureSchema = z.object({
  beatsPerBar: z.literal([...BEATS_PER_BAR]),
  parts: z.array(PartSchema).min(1),
  notes: z.string(),
});
export type Structure = z.infer<typeof StructureSchema>;

// Checks the model output against the bar count. Returns an error message for
// the retry prompt, or null when the structure is usable.
export function validateStructure(structure: Structure, totalBars: number): string | null {
  let expectedFrom = 1;
  for (const part of structure.parts) {
    if (part.fromBar !== expectedFrom) {
      return `Part "${part.name}" starts at bar ${part.fromBar}, expected ${expectedFrom}. Parts must be ascending, gapless and non-overlapping.`;
    }
    if (part.toBar < part.fromBar) return `Part "${part.name}" ends before it starts.`;
    expectedFrom = part.toBar + 1;
  }
  if (expectedFrom !== totalBars + 1) {
    return `Parts end at bar ${expectedFrom - 1}, but the piece has ${totalBars} bars. The last part must end at bar ${totalBars}.`;
  }
  return null;
}

export function fallbackStructure(
  beatsPerBar: Structure["beatsPerBar"],
  totalBars: number,
): Structure {
  return {
    beatsPerBar,
    parts: [{ name: "Song", fromBar: 1, toBar: totalBars, barsPerBlock: 4 }],
    notes: "",
  };
}
