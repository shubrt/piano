import { z } from "zod";

// A song is a folder songs/<id>/ with notes.mid and this song.json. Bars, blocks,
// repeats and the scale are derived from the MIDI and this grid at load time.

export const BARS_PER_BLOCK = [2, 4, 8] as const;
export const BEATS_PER_BAR = [3, 4, 6] as const;

export const PartSchema = z.object({
  name: z.string().min(1),
  fromBar: z.number().int().min(1),
  toBar: z.number().int().min(1),
  barsPerBlock: z.literal([...BARS_PER_BLOCK]),
});
export type Part = z.infer<typeof PartSchema>;

export const HandsSchema = z.discriminatedUnion("type", [
  // One MIDI track, hands found per note from reach, movement and register.
  z.object({ type: z.literal("auto") }),
  // One MIDI track, fixed split: everything below splitPitch is the left hand.
  z.object({ type: z.literal("split"), splitPitch: z.number().int().min(0).max(127) }),
  // Two MIDI tracks: the track with the higher mean pitch is the right hand.
  z.object({ type: z.literal("tracks") }),
]);
export type Hands = z.infer<typeof HandsSchema>;

export const SourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("youtube"), url: z.string().url() }),
  z.object({ type: z.literal("midi"), fileName: z.string() }),
]);

// Protocol and cache of the last structure analysis. Never steers the player.
export const AnalysisSchema = z.object({
  model: z.string(),
  at: z.string(),
  barFingerprints: z.string(),
  notes: z.string().optional(),
  // Set when the model failed twice and the fallback structure was written.
  error: z.string().optional(),
});

export const SongSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: SourceSchema,
  bpm: z.number().positive(),
  beatsPerBar: z.literal([...BEATS_PER_BAR]),
  offsetSec: z.number(),
  hands: HandsSchema,
  // Shorten every note in the display to the next onset of the same hand. For
  // recordings played with the pedal, where the transcription writes the ring
  // time instead of the key time. Optional rather than defaulted so a partial
  // patch does not reset it. Playback keeps the full length either way.
  pedalTrim: z.boolean().optional(),
  parts: z.array(PartSchema).default([]),
  analysis: AnalysisSchema.optional(),
});
export type Song = z.infer<typeof SongSchema>;
export type SongInput = z.input<typeof SongSchema>;

// Fields the player may change from its correction inputs.
export const SongPatchSchema = SongSchema.pick({
  bpm: true,
  beatsPerBar: true,
  offsetSec: true,
  hands: true,
  pedalTrim: true,
}).partial();
export type SongPatch = z.infer<typeof SongPatchSchema>;
