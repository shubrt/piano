import { z } from "zod";
import { PartSchema, type Part } from "./song";

// A song's expected structure for the benchmark, songs/<id>/reference.json.
// Written once from a model run, then hand-corrected where the model was wrong.
export const ReferenceSchema = z.object({
  model: z.string(),
  at: z.string(),
  parts: z.array(PartSchema).min(1),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export type PartScore = {
  // 0 to 100. Identical boundaries and block grids give 100. Names never count.
  score: number;
  // Share of reference part starts the candidate also starts a part on.
  recall: number;
  // Share of candidate part starts that are reference part starts.
  precision: number;
  // Share of reference block starts that are block starts in the candidate.
  alignment: number;
  missing: number[];
  extra: number[];
};

// Compares candidate parts with the reference of a song. Part starts weigh
// most, then block alignment, since the player practises block by block.
export function scoreParts(candidate: readonly Part[], reference: readonly Part[]): PartScore {
  const refStarts = new Set(reference.map((p) => p.fromBar));
  const candStarts = new Set(candidate.map((p) => p.fromBar));
  const hits = [...refStarts].filter((b) => candStarts.has(b)).length;
  const recall = hits / refStarts.size;
  const precision = hits / candStarts.size;
  const refBlocks = blockStarts(reference);
  const candBlocks = blockStarts(candidate);
  const aligned = refBlocks.filter((b) => candBlocks.has(b)).length;
  const alignment = refBlocks.length === 0 ? 1 : aligned / refBlocks.length;
  return {
    score: Math.round(100 * (0.4 * recall + 0.3 * precision + 0.3 * alignment)),
    recall,
    precision,
    alignment,
    missing: [...refStarts].filter((b) => !candStarts.has(b)),
    extra: [...candStarts].filter((b) => !refStarts.has(b)),
  };
}

function blockStarts(parts: readonly Part[]): number[] & Set<number> {
  const starts: number[] = [];
  for (const p of parts) for (let b = p.fromBar; b <= p.toBar; b += p.barsPerBlock) starts.push(b);
  return Object.assign(starts, { has: (b: number) => starts.includes(b) }) as never;
}

export function formatParts(parts: readonly Part[]): string {
  return parts.map((p) => `${p.name} ${p.fromBar}-${p.toBar}/${p.barsPerBlock}`).join(" | ");
}
