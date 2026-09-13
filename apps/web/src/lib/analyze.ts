import { onsetHistogram, suggestBeatsPerBar } from "./analysis/chords";
import { detectTempo, roundBpm } from "./analysis/tempo";
import { env } from "./env";
import { parseMidi } from "./midi";
import { assignHands, detectHands } from "./notes";
import type { Song } from "./song";
import { detectStructure } from "./structure/detect";

// Steps 4 to 7 of the pipeline: grid from onsets, hands, then the model for
// time signature, parts and block size. Shared by MIDI drop and YouTube import.
export async function analyzeNewSong(
  input: Pick<Song, "id" | "title" | "source">,
  midi: Uint8Array,
): Promise<Song> {
  const parsed = parseMidi(midi);
  const hands = detectHands(parsed);
  const notes = assignHands(parsed, hands);
  // A tempo event anchors the bar grid at tick 0. Without one, tempo and offset
  // come from the onsets.
  const detected = detectTempo(notes.map((n) => n.time));
  const tempo = parsed.tempoBpm
    ? { bpm: roundBpm(parsed.tempoBpm), offsetSec: 0 }
    : { bpm: detected.bpm, offsetSec: detected.offsetSec };
  // Starting guess for the time signature; the model may still change it.
  const beatsPerBar = suggestBeatsPerBar(onsetHistogram({ ...tempo, beatsPerBar: 12 }, notes));
  const grid = { ...tempo, beatsPerBar };
  const result = await detectStructure({
    grid,
    notes,
    apiKey: env.OPENROUTER_API_KEY,
    model: env.STRUCTURE_MODEL,
    fixedBeatsPerBar: false,
  });
  return {
    ...input,
    bpm: grid.bpm,
    offsetSec: grid.offsetSec,
    beatsPerBar: result.structure.beatsPerBar,
    hands,
    parts: result.record.error ? [] : result.structure.parts,
    analysis: result.record,
  };
}

// "Struktur neu": keeps the user's grid and hands, asks the model again for parts.
export async function reanalyzeStructure(song: Song, midi: Uint8Array): Promise<Song> {
  const notes = assignHands(parseMidi(midi), song.hands);
  const result = await detectStructure({
    grid: song,
    notes,
    apiKey: env.OPENROUTER_API_KEY,
    model: env.STRUCTURE_MODEL,
    fixedBeatsPerBar: true,
  });
  return {
    ...song,
    parts: result.record.error ? [] : result.structure.parts,
    analysis: result.record,
  };
}
