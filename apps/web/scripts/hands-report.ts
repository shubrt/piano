// Static HTML report for the hands benchmark: one overview table, then per song
// the bars with mistakes as small piano rolls, then the lint findings. No
// script, everything is rendered into the markup.
import {
  accuracy,
  type BarScore,
  type Finding,
  type FindingKind,
  handName,
  noteName,
} from "../src/lib/benchmark-hands";
import type { Grid } from "../src/lib/grid";
import { barOfBeat, barStartBeat, timeToBeat } from "../src/lib/grid";
import type { Note } from "../src/lib/notes";
import type { Song } from "../src/lib/song";

export type SongResult = {
  song: Song;
  // Display-trimmed notes with the hands the player shows.
  notes: Note[];
  // The same notes as the per-bar heuristic assigns them, for the reference rolls.
  heuristic: Note[];
  tracks: BarScore[] | null;
  labels: BarScore[] | null;
  findings: Finding[];
};

const LEFT = "#4f7be8";
const RIGHT = "#3fae52";
const KIND_LABEL: Record<FindingKind, string> = {
  span: "Griff zu weit",
  jump: "Sprung",
  cross: "Hände gekreuzt",
  inconsistent: "Uneinheitlich",
};
const KINDS: FindingKind[] = ["span", "jump", "cross", "inconsistent"];

export function renderHandsReport(results: readonly SongResult[], at: Date): string {
  const withReference = results.filter((r) => r.tracks || r.labels);
  const body = [
    `<h1>Handzuweisung Benchmark</h1>`,
    `<p class="meta">${escape(at.toISOString().slice(0, 16).replace("T", " "))} · ${results.length} Songs · Heuristik: Zuweisung pro Note (<code>assignAuto</code>)</p>`,
    legend(),
    `<h2>Übersicht</h2>`,
    overview(results),
    ...withReference.map(referenceSection),
    `<h2>Lint ohne Referenz</h2>`,
    `<p>Vier Prüfungen auf der Zuweisung, die der Player anzeigt. Griff zu weit: zwei Noten einer Hand gleichzeitig weiter als 14 Halbtöne. Sprung: eine Hand bewegt sich in unter 120 ms mehr als eine Oktave. Hände gekreuzt: links schlägt über rechts an. Uneinheitlich: ein Takt mit denselben Noten wie ein anderer, aber anderer Handverteilung.</p>`,
    ...results.map(lintSection),
    `<h2>Methode</h2>`,
    `<p>Zwei Wahrheitsquellen. MIDI-Dateien mit zwei Notenspuren: die Spuren sind die Hände, die Heuristik läuft auf den zusammengelegten Noten. <code>hands.json</code> neben dem Song: pro Takt die Tonhöhen der linken Hand, alles andere ist rechts. Genauigkeit ist der Anteil der Noten mit richtiger Hand über alle Referenztakte.</p>`,
    `<p>Der Lint findet nur, was physisch oder strukturell auffällt. Eine spielbare, aber unmusikalische Verteilung wie das Begleitmuster in Dragon Quest Takt 1 bis 4 braucht ein Label.</p>`,
  ].join("\n");
  return page(body);
}

function overview(results: readonly SongResult[]): string {
  const rows = results.map((r) => {
    const scores = [...(r.tracks ?? []), ...(r.labels ?? [])];
    const source = r.tracks ? "Spuren" : r.labels ? "Labels" : "";
    const acc = scores.length ? pct(accuracy(scores)) : "";
    const badBars = scores.filter((b) => b.mistakes.length > 0).length;
    const bars = scores.length ? `${badBars} / ${scores.length}` : "";
    const counts = KINDS.map((k) => r.findings.filter((f) => f.kind === k).length);
    return `<tr><td>${escape(r.song.title)}</td><td>${source}</td><td class="num">${acc}</td><td class="num">${bars}</td>${counts.map((c) => `<td class="num">${c || ""}</td>`).join("")}</tr>`;
  });
  return `<table><thead><tr><th>Song</th><th>Referenz</th><th class="num">Noten richtig</th><th class="num">Takte mit Fehlern</th>${KINDS.map((k) => `<th class="num">${KIND_LABEL[k]}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>
<p class="meta">Lint-Spalten zählen Takte, nicht Notenpaare.</p>`;
}

function referenceSection(r: SongResult): string {
  const out = [`<h2>${escape(r.song.title)}</h2>`];
  if (r.labels) {
    out.push(`<h3>Gelabelte Takte, ${pct(accuracy(r.labels))} richtig</h3>`);
    for (const b of r.labels) out.push(barBlock(r, b));
  }
  if (r.tracks) {
    const bad = r.tracks.filter((b) => b.mistakes.length > 0);
    out.push(
      `<h3>Spuren als Referenz, ${pct(accuracy(r.tracks))} richtig, ${bad.length} von ${r.tracks.length} Takten mit Fehlern</h3>`,
    );
    const worst = [...bad]
      .sort((a, b) => b.mistakes.length / b.total - a.mistakes.length / a.total)
      .slice(0, 4);
    if (worst.length) out.push(`<p>Die vier schlechtesten Takte.</p>`);
    for (const b of worst) out.push(barBlock(r, b));
  }
  return out.join("\n");
}

function barBlock(r: SongResult, score: BarScore): string {
  const wrong = new Map(score.mistakes.map((m) => [`${m.beat.toFixed(3)}:${m.midi}`, m]));
  const inBar = r.heuristic.filter(
    (n) => barOfBeat(r.song, timeToBeat(r.song, n.time)) === score.bar,
  );
  const marked = inBar.map((n) => {
    const beat = timeToBeat(r.song, n.time) - barStartBeat(r.song, score.bar);
    return { note: n, beat, mistake: wrong.get(`${beat.toFixed(3)}:${n.midi}`) };
  });
  const rows = score.mistakes
    .sort((a, b) => a.beat - b.beat)
    .map(
      (m) =>
        `<tr><td class="num">${(m.beat + 1).toFixed(2)}</td><td>${noteName(m.midi)}</td><td>${handName(m.expected)}</td><td>${handName(m.actual)}</td></tr>`,
    );
  const table = rows.length
    ? `<table class="small"><thead><tr><th class="num">Schlag</th><th>Note</th><th>Referenz</th><th>Heuristik</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
    : "";
  return `<h4>Takt ${score.bar}, ${score.mistakes.length} von ${score.total} Noten falsch</h4>
<div class="bar">${roll(r.song, marked)}${table}</div>`;
}

function lintSection(r: SongResult): string {
  if (r.findings.length === 0) return `<h3>${escape(r.song.title)}: keine Auffälligkeiten</h3>`;
  const rows = r.findings.map(
    (f) =>
      `<tr><td class="num">${f.bar}</td><td>${KIND_LABEL[f.kind]}</td><td class="num">${f.count}</td><td>${escape(f.example)}</td></tr>`,
  );
  const top = [...r.findings]
    .filter((f) => f.kind !== "inconsistent")
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);
  const rolls = top.map((f) => {
    const inBar = r.notes.filter((n) => barOfBeat(r.song, timeToBeat(r.song, n.time)) === f.bar);
    const marked = inBar.map((n) => ({
      note: n,
      beat: timeToBeat(r.song, n.time) - barStartBeat(r.song, f.bar),
      mistake: undefined,
    }));
    return `<h4>Takt ${f.bar}, ${KIND_LABEL[f.kind]} ×${f.count}</h4><div class="bar">${roll(r.song, marked)}</div>`;
  });
  return `<h3>${escape(r.song.title)}, ${r.findings.length} Auffälligkeiten in ${new Set(r.findings.map((f) => f.bar)).size} Takten</h3>
<details><summary>Alle Funde</summary><table class="small"><thead><tr><th class="num">Takt</th><th>Prüfung</th><th class="num">Anzahl</th><th>Beispiel</th></tr></thead><tbody>${rows.join("")}</tbody></table></details>
${rolls.join("\n")}`;
}

type Marked = { note: Note; beat: number; mistake: { expected: "left" | "right" } | undefined };

// One bar as a piano roll: beats left to right, pitch bottom to top. Fill is
// the assigned hand, a white ring marks notes the reference puts in the other
// hand.
function roll(grid: Grid, notes: readonly Marked[]): string {
  const width = 640;
  const left = 34;
  const plot = width - left - 8;
  const rowH = 7;
  const pitches = notes.map((m) => m.note.midi);
  const lo = Math.min(...pitches, 60) - 1;
  const hi = Math.max(...pitches, 60) + 1;
  const height = (hi - lo + 1) * rowH + 18;
  const x = (beat: number) => left + (Math.max(0, beat) / grid.beatsPerBar) * plot;
  const y = (midi: number) => 4 + (hi - midi) * rowH;
  const parts: string[] = [];
  for (let b = 0; b <= grid.beatsPerBar; b++) {
    parts.push(
      `<line x1="${x(b)}" y1="0" x2="${x(b)}" y2="${height - 14}" stroke="${b === 0 || b === grid.beatsPerBar ? "#444" : "#222"}"/>`,
    );
    if (b < grid.beatsPerBar)
      parts.push(`<text x="${x(b) + 3}" y="${height - 3}" class="tick">${b + 1}</text>`);
  }
  for (let midi = lo; midi <= hi; midi++) {
    if (midi % 12 !== 0) continue;
    parts.push(
      `<line x1="${left}" y1="${y(midi) + 3}" x2="${width - 8}" y2="${y(midi) + 3}" stroke="#1a1a1a"/>`,
    );
    parts.push(`<text x="2" y="${y(midi) + 6}" class="tick">${noteName(midi)}</text>`);
  }
  for (const m of notes) {
    const beatLen = m.note.duration / (60 / grid.bpm);
    const w = Math.max(4, Math.min(x(m.beat + beatLen), left + plot) - x(m.beat));
    const fill = m.note.hand === "left" ? LEFT : RIGHT;
    const ring = m.mistake ? ` stroke="#fff" stroke-width="1.5"` : "";
    parts.push(
      `<rect x="${x(m.beat)}" y="${y(m.note.midi)}" width="${w}" height="6" rx="2" fill="${fill}"${ring}/>`,
    );
    if (m.mistake)
      parts.push(
        `<text x="${x(m.beat) + w + 3}" y="${y(m.note.midi) + 6}" class="label">${noteName(m.note.midi)} → ${handName(m.mistake.expected)}</text>`,
      );
  }
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Takt als Piano-Roll">${parts.join("")}</svg>`;
}

function legend(): string {
  return `<p class="legend"><span class="swatch" style="background:${LEFT}"></span>links <span class="swatch" style="background:${RIGHT}"></span>rechts <span class="swatch ring"></span>laut Referenz andere Hand</p>`;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)} %`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(body: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Handzuweisung Benchmark</title>
<style>
body { margin: 0 auto; padding: 16px; max-width: 960px; background: #000; color: #fff; font: 14px/1.45 -apple-system, Helvetica, Arial, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 28px 0 8px; border-top: 1px solid #222; padding-top: 12px; }
h3 { font-size: 14px; margin: 18px 0 6px; }
h4 { font-size: 13px; font-weight: normal; margin: 14px 0 4px; }
p { margin: 6px 0; }
.meta { color: #888; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #ccc; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 3px 8px 3px 0; border-bottom: 1px solid #222; vertical-align: top; }
th { font-weight: normal; color: #888; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
table.small { width: auto; min-width: 280px; margin-top: 6px; }
.bar { max-width: 100%; }
svg { width: 100%; height: auto; display: block; background: #000; }
.tick { fill: #666; font-size: 9px; font-family: ui-monospace, Menlo, monospace; }
.label { fill: #fff; font-size: 9px; font-family: ui-monospace, Menlo, monospace; }
.legend { color: #ccc; }
.swatch { display: inline-block; width: 12px; height: 8px; border-radius: 2px; margin: 0 4px 0 10px; vertical-align: middle; }
.swatch.ring { border: 1.5px solid #fff; background: #555; }
details summary { cursor: pointer; color: #888; margin: 4px 0; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
