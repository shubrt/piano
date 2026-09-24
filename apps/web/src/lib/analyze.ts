import { onsetHistogram, suggestBeatsPerBar } from "./analysis/chords";
import { detectTempo, roundBpm } from "./analysis/tempo";
import { env } from "./env";
import { parseMidi } from "./midi";
import { allOnsets, assignHands, detectHands, withHandOverrides } from "./notes";
import type { Song } from "./song";
import { detectStructure, LOCAL_MODEL } from "./structure/detect";

// Steps 4 to 7 of the pipeline: grid from onsets, hands, then the local
// heuristic for parts and block size. Shared by MIDI drop and YouTube import.
// The model runs only on request, see reanalyzeStructure.
export async function analyzeNewSong(
  input: Pick<Song, "id" | "title" | "source">,
  midi: Uint8Array,
): Promise<Song> {
  const parsed = parseMidi(midi);
  const hands = detectHands(parsed);
  // A tempo event in a MIDI file anchors the bar grid at tick 0. Transcribed
  // audio carries only the transcriber's default tempo, so YouTube songs and
  // files without a tempo event get tempo and offset from the onsets.
  const tempoEvent = input.source.type === "midi" ? parsed.tempoBpm : null;
  const detected = detectTempo(allOnsets(parsed));
  const tempo = tempoEvent
    ? { bpm: roundBpm(tempoEvent), offsetSec: 0 }
    : { bpm: detected.bpm, offsetSec: detected.offsetSec };
  // Starting guess for the time signature; the model may still change it.
  const notesForMeter = assignHands(parsed, hands);
  const beatsPerBar = suggestBeatsPerBar(
    onsetHistogram({ ...tempo, beatsPerBar: 12 }, notesForMeter),
  );
  const grid = { ...tempo, beatsPerBar };
  const notes = assignHands(parsed, hands);
  const result = await detectStructure({
    grid,
    notes,
    apiKey: env.OPENROUTER_API_KEY,
    model: LOCAL_MODEL,
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

// Keeps the user's grid and hands and finds the parts again. "Struktur neu" in
// the player uses the heuristic, the "KI-Analyse" button in the song list asks
// STRUCTURE_MODEL and overwrites the parts with its answer.
export async function reanalyzeStructure(
  song: Song,
  midi: Uint8Array,
  options: { ai: boolean },
): Promise<Song> {
  const notes = withHandOverrides(assignHands(parseMidi(midi), song.hands), song.handOverrides);
  const result = await detectStructure({
    grid: song,
    notes,
    apiKey: env.OPENROUTER_API_KEY,
    model: options.ai ? env.STRUCTURE_MODEL : LOCAL_MODEL,
    fixedBeatsPerBar: true,
  });
  return {
    ...song,
    parts: result.record.error ? [] : result.structure.parts,
    analysis: result.record,
  };
}
