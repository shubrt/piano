// Benchmark of the hand assignment over every song in SONGS_DIR.
//
//   vp run benchmark:hands                      console summary
//   vp run benchmark:hands -- --html report.html   plus a static HTML report
//
// Truth comes from two sources: MIDI files with two note tracks (the tracks are
// the hands, the heuristic runs on the flattened notes) and <song>/hands.json
// with hand-labelled bars, see HandLabelsSchema. Every song is also linted for
// bars that look doubtful without a reference. Exit code 1 when a song with a
// reference is below 100 %.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  accuracy,
  type FindingKind,
  HandLabelsSchema,
  lintHands,
  scoreLabels,
  scoreTracks,
} from "../src/lib/benchmark-hands";
import { env } from "../src/lib/env";
import { parseMidi } from "../src/lib/midi";
import { assignHands } from "../src/lib/notes";
import { trimForDisplay } from "../src/lib/trim";
import { renderHandsReport, type SongResult } from "./hands-report";
import { listSongFolders } from "./song-files";

const args = process.argv.slice(2);
const htmlFlag = args.indexOf("--html");
const htmlPath = htmlFlag >= 0 ? args[htmlFlag + 1] : null;
if (htmlFlag >= 0 && !htmlPath) {
  console.error("--html needs a file path");
  process.exit(2);
}

const results: SongResult[] = [];
for (const { song, midi, dir } of await listSongFolders(env.SONGS_DIR)) {
  const parsed = parseMidi(midi);
  const shown = assignHands(parsed, song.hands);
  const notes = trimForDisplay(shown, song.pedalTrim ?? false);
  const labelsPath = path.join(dir, "hands.json");
  const labels = existsSync(labelsPath)
    ? scoreLabels(
        song,
        shown,
        HandLabelsSchema.parse(JSON.parse(await readFile(labelsPath, "utf8"))),
      )
    : null;
  const tracks = scoreTracks(parsed, song);
  const findings = lintHands(song, shown);
  // Reference rolls show what the heuristic did, for track songs that differs from the player.
  const heuristic = tracks
    ? trimForDisplay(assignHands(parsed, { type: "auto" }), song.pedalTrim ?? false)
    : notes;
  results.push({ song, notes, heuristic, tracks, labels, findings });

  console.log(`\n${song.title}`);
  if (tracks) {
    const bad = tracks.filter((b) => b.mistakes.length > 0);
    const worst = [...bad]
      .sort((a, b) => b.mistakes.length - a.mistakes.length)
      .slice(0, 3)
      .map((b) => `${b.bar} (${b.mistakes.length}/${b.total})`);
    console.log(
      `  Spuren:  ${pct(accuracy(tracks))} richtig, ${bad.length} von ${tracks.length} Takten mit Fehlern${worst.length ? `, schlechteste: ${worst.join(", ")}` : ""}`,
    );
  }
  if (labels) {
    const detail = labels
      .map((b) => `Takt ${b.bar} ${b.mistakes.length}/${b.total} falsch`)
      .join(", ");
    console.log(`  Labels:  ${pct(accuracy(labels))} richtig, ${detail}`);
  }
  const kinds: FindingKind[] = ["span", "jump", "cross", "inconsistent"];
  const counts = kinds
    .map((k) => [k, findings.filter((f) => f.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`);
  console.log(`  Lint:    ${counts.length ? `${counts.join(", ")} Takte` : "nichts auffällig"}`);
}

const scored = results.filter((r) => r.tracks || r.labels);
const below = scored.filter((r) => accuracy([...(r.tracks ?? []), ...(r.labels ?? [])]) < 1);
if (scored.length) {
  const mean =
    scored.reduce((s, r) => s + accuracy([...(r.tracks ?? []), ...(r.labels ?? [])]), 0) /
    scored.length;
  console.log(
    `\n${results.length} Songs, ${scored.length} mit Referenz, mittlere Genauigkeit ${pct(mean)}, ${below.length} unter 100 %`,
  );
}

if (htmlPath) {
  await writeFile(htmlPath, renderHandsReport(results, new Date()));
  console.log(`Report: ${htmlPath}`);
}

process.exit(below.length > 0 ? 1 : 0);

function pct(x: number): string {
  return `${(x * 100).toFixed(1)} %`;
}
