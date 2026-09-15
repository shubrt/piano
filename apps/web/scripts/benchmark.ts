// Benchmark of the local structure heuristic against songs/<id>/reference.json.
//
//   vp run benchmark                 score every song that has a reference
//   vp run benchmark --reference     write missing references with STRUCTURE_MODEL
//   vp run benchmark --reference anthropic/claude-opus-5
//
// A reference is one model answer, so check it in the player before trusting
// it; it can be edited by hand. Exit code 1 when any song scores below 100.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyseNotes } from "../src/lib/analysis";
import { formatParts, ReferenceSchema, scoreParts } from "../src/lib/benchmark";
import { env } from "../src/lib/env";
import { parseMidi } from "../src/lib/midi";
import { assignHands } from "../src/lib/notes";
import { listSongs, readMidi, songDir } from "../src/lib/storage";
import { detectStructure, LOCAL_MODEL } from "../src/lib/structure/detect";
import { segmentStructure } from "../src/lib/structure/heuristic";

const args = process.argv.slice(2);
const referenceFlag = args.indexOf("--reference");
const recordModel = referenceFlag >= 0 ? (args[referenceFlag + 1] ?? env.STRUCTURE_MODEL) : null;

if (recordModel === LOCAL_MODEL) {
  console.error(
    "A reference needs a model, STRUCTURE_MODEL is local. Pass one: --reference <model>",
  );
  process.exit(2);
}

const songs = await listSongs();
const results: { title: string; score: number }[] = [];
let missingReference = 0;

for (const song of songs) {
  const referencePath = path.join(songDir(song.id), "reference.json");
  const notes = assignHands(parseMidi(await readMidi(song.id)), song.hands, song);

  if (recordModel && !existsSync(referencePath)) {
    const result = await detectStructure({
      grid: song,
      notes,
      apiKey: env.OPENROUTER_API_KEY,
      model: recordModel,
      fixedBeatsPerBar: true,
    });
    if (result.record.error) {
      console.log(`${song.title}: no reference, ${recordModel} failed: ${result.record.error}`);
      continue;
    }
    const reference = { model: recordModel, at: result.record.at, parts: result.structure.parts };
    await writeFile(referencePath, JSON.stringify(reference, null, 2) + "\n");
    console.log(`${song.title}: reference written from ${recordModel}`);
  }

  if (!existsSync(referencePath)) {
    console.log(`${song.title}: no reference.json, run with --reference`);
    missingReference++;
    continue;
  }
  const reference = ReferenceSchema.parse(JSON.parse(await readFile(referencePath, "utf8")));
  const started = performance.now();
  const structure = segmentStructure(analyseNotes(song, notes), song.beatsPerBar);
  const ms = performance.now() - started;
  const score = scoreParts(structure.parts, reference.parts);
  results.push({ title: song.title, score: score.score });

  console.log(`\n${song.title}: ${score.score} (${ms.toFixed(1)} ms)`);
  if (score.score < 100) {
    console.log(`  reference: ${formatParts(reference.parts)}`);
    console.log(`  local:     ${formatParts(structure.parts)}`);
    if (score.missing.length) console.log(`  missing part starts: ${score.missing.join(", ")}`);
    if (score.extra.length) console.log(`  extra part starts:   ${score.extra.join(", ")}`);
    console.log(
      `  starts found ${pct(score.recall)}, starts correct ${pct(score.precision)}, blocks aligned ${pct(score.alignment)}`,
    );
  }
}

if (results.length > 0) {
  const mean = results.reduce((s, r) => s + r.score, 0) / results.length;
  const below = results.filter((r) => r.score < 100);
  console.log(
    `\n${results.length} songs, mean ${mean.toFixed(1)}, ${below.length} below 100${missingReference ? `, ${missingReference} without reference` : ""}`,
  );
  process.exit(below.length > 0 ? 1 : 0);
}

function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}
