import { analyseNotes, type NoteAnalysis } from "../analysis";
import type { Grid } from "../grid";
import type { Note } from "../notes";
import type { Song } from "../song";
import { type ChatMessage, completeStructured } from "./openrouter";
import { segmentStructure } from "./heuristic";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { fallbackStructure, type Structure, StructureSchema, validateStructure } from "./schema";

export type StructureResult = {
  structure: Structure;
  analysis: NoteAnalysis;
  // Protocol for song.json. error is set when the fallback was used.
  record: NonNullable<Song["analysis"]>;
};

const MAX_ATTEMPTS = 3;
// STRUCTURE_MODEL value that runs the local heuristic instead of a model.
export const LOCAL_MODEL = "local";

// Runs the model until it returns a valid structure for a stable time signature.
// A changed time signature recomputes the table and asks again; a validation
// error feeds the message back once. After MAX_ATTEMPTS the fallback applies.
// With model "local" the deterministic heuristic answers instead, keeping the grid.
export async function detectStructure(options: {
  grid: Grid;
  notes: readonly Note[];
  apiKey: string | undefined;
  model: string;
  fixedBeatsPerBar: boolean;
}): Promise<StructureResult> {
  let grid = options.grid;
  let analysis = analyseNotes(grid, options.notes);
  const at = new Date().toISOString();
  const beatsPerBar = grid.beatsPerBar as Structure["beatsPerBar"];

  if (options.model === LOCAL_MODEL) {
    const structure = segmentStructure(analysis, beatsPerBar);
    return {
      structure,
      analysis,
      record: { model: LOCAL_MODEL, at, barFingerprints: joinLetters(analysis) },
    };
  }

  if (!options.apiKey) {
    return {
      structure: fallbackStructure(beatsPerBar, analysis.totalBars),
      analysis,
      record: {
        model: "none",
        at,
        barFingerprints: joinLetters(analysis),
        error: "OPENROUTER_API_KEY fehlt",
      },
    };
  }

  let messages: ChatMessage[] = [];
  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (messages.length === 0) {
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(grid, analysis, { fixedBeatsPerBar: options.fixedBeatsPerBar }),
        },
      ];
    }
    let content: string;
    try {
      content = await completeStructured({
        apiKey: options.apiKey,
        model: options.model,
        messages,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }
    const parsed = StructureSchema.safeParse(safeJson(content));
    if (!parsed.success) {
      lastError = `Antwort entsprach nicht dem Schema: ${parsed.error.message}`;
      messages = [
        ...messages,
        { role: "assistant", content },
        { role: "user", content: `Invalid answer: ${lastError}. Reply again with valid JSON.` },
      ];
      continue;
    }
    const structure = options.fixedBeatsPerBar ? { ...parsed.data, beatsPerBar } : parsed.data;
    if (structure.beatsPerBar !== grid.beatsPerBar) {
      grid = { ...grid, beatsPerBar: structure.beatsPerBar };
      analysis = analyseNotes(grid, options.notes);
      messages = [];
      lastError = `Taktart ${structure.beatsPerBar} gewählt, Tabelle neu berechnet, keine gültige Antwort mehr erhalten`;
      continue;
    }
    const problem = validateStructure(structure, analysis.totalBars);
    if (problem) {
      lastError = problem;
      messages = [
        ...messages,
        { role: "assistant", content },
        { role: "user", content: `Invalid answer: ${problem} Reply again with valid JSON.` },
      ];
      continue;
    }
    return {
      structure,
      analysis,
      record: {
        model: options.model,
        at,
        barFingerprints: joinLetters(analysis),
        notes: structure.notes || undefined,
      },
    };
  }
  return {
    structure: fallbackStructure(grid.beatsPerBar as Structure["beatsPerBar"], analysis.totalBars),
    analysis,
    record: {
      model: options.model,
      at,
      barFingerprints: joinLetters(analysis),
      error: lastError || "Keine gültige Antwort",
    },
  };
}

function joinLetters(analysis: NoteAnalysis): string {
  const groups: string[] = [];
  for (let b = 0; b < analysis.totalBars; b += 4)
    groups.push(analysis.fingerprints.all.slice(b, b + 4).join(""));
  return groups.join(" ");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
