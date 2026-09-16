import { z } from "zod";
import { quantiseNotes } from "./analysis/fingerprints";
import { barOfBeat, barStartBeat, type Grid, timeToBeat } from "./grid";
import type { ParsedMidi } from "./midi";
import { assignHands, type Hand, MAX_HAND_SPAN, type Note } from "./notes";

// Hand labels for a few bars of a song, <song dir>/hands.json. Each entry maps
// a bar number to the pitches the left hand plays in that bar, everything else
// in the bar is the right hand. Pitches are note names like "G#3" or "Eb4".
export const HandLabelsSchema = z.object({
  comment: z.string().optional(),
  bars: z.record(z.string().regex(/^\d+$/), z.array(z.string())),
});
export type HandLabels = z.infer<typeof HandLabelsSchema>;

export type Mistake = { beat: number; midi: number; expected: Hand; actual: Hand };
// One bar checked against a reference: how many notes it has, which got the wrong hand.
export type BarScore = { bar: number; total: number; mistakes: Mistake[] };

export type FindingKind = "span" | "jump" | "cross" | "inconsistent";
// A bar where the assignment looks physically or musically doubtful, found
// without any reference.
export type Finding = { kind: FindingKind; bar: number; count: number; example: string };

// Compares the assigned hands with the labelled bars of a song.
export function scoreLabels(grid: Grid, notes: readonly Note[], labels: HandLabels): BarScore[] {
  return Object.entries(labels.bars)
    .map(([key, left]) => {
      const bar = Number(key);
      const leftPitches = new Set(left.map(noteNumber));
      const inBar = notes.filter((n) => barOfBeat(grid, timeToBeat(grid, n.time)) === bar);
      const mistakes: Mistake[] = [];
      for (const n of inBar) {
        const expected: Hand = leftPitches.has(n.midi) ? "left" : "right";
        if (expected !== n.hand)
          mistakes.push({
            beat: beatInBar(grid, bar, n.time),
            midi: n.midi,
            expected,
            actual: n.hand,
          });
      }
      return { bar, total: inBar.length, mistakes };
    })
    .sort((a, b) => a.bar - b.bar);
}

// Files with two note tracks carry the hands already. Flatten them as a
// transcription would come in, split per bar, and compare with the tracks.
// Null when the file has one track.
export function scoreTracks(parsed: ParsedMidi, grid: Grid): BarScore[] | null {
  if (parsed.tracks.length < 2) return null;
  const truth = assignHands(parsed, { type: "tracks" });
  const guess = assignHands(parsed, { type: "auto" });
  const byBar = new Map<number, BarScore>();
  truth.forEach((t, i) => {
    const g = guess[i]!;
    if (g.time !== t.time || g.midi !== t.midi) throw new Error("note order differs");
    const bar = barOfBeat(grid, timeToBeat(grid, t.time));
    const score = byBar.get(bar) ?? { bar, total: 0, mistakes: [] };
    score.total++;
    if (g.hand !== t.hand)
      score.mistakes.push({
        beat: beatInBar(grid, bar, t.time),
        midi: t.midi,
        expected: t.hand,
        actual: g.hand,
      });
    byBar.set(bar, score);
  });
  return [...byBar.values()].sort((a, b) => a.bar - b.bar);
}

export function accuracy(scores: readonly BarScore[]): number {
  const total = scores.reduce((s, b) => s + b.total, 0);
  const wrong = scores.reduce((s, b) => s + b.mistakes.length, 0);
  return total === 0 ? 1 : 1 - wrong / total;
}

// Two onsets closer than this are struck together.
const CHORD_SEC = 0.05;
// A hand that has to move more than an octave in this time is probably two hands.
const JUMP_SEC = 0.12;
const JUMP_SPAN = 12;

// Checks that need no reference:
//   span          notes struck together in one hand, wider than MAX_HAND_SPAN
//   jump          one hand moves more than an octave within JUMP_SEC
//   cross         the left hand strikes above the right hand
//   inconsistent  a bar with the same notes as another bar, but other hands
export function lintHands(grid: Grid, notes: readonly Note[]): Finding[] {
  const found = new Map<string, Finding>();
  const add = (kind: FindingKind, bar: number, example: string) => {
    const key = `${kind}:${bar}`;
    const existing = found.get(key);
    if (existing) existing.count++;
    else found.set(key, { kind, bar, count: 1, example });
  };

  const sorted = [...notes].sort((a, b) => a.time - b.time);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const bar = barOfBeat(grid, timeToBeat(grid, a.time));
    // The jump check only looks at the next strike of the same hand, a fast
    // arpeggio covers two octaves in small steps without any jump.
    let nextStrikeSeen = false;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.time - a.time > JUMP_SEC) break;
      const together = b.time - a.time < CHORD_SEC;
      const interval = Math.abs(a.midi - b.midi);
      if (a.hand === b.hand) {
        if (together && interval > MAX_HAND_SPAN)
          add(
            "span",
            bar,
            `${noteName(a.midi)} und ${noteName(b.midi)} zusammen ${handName(a.hand)}`,
          );
        else if (!together && !nextStrikeSeen) {
          nextStrikeSeen = true;
          if (interval > JUMP_SPAN)
            add("jump", bar, `${noteName(a.midi)} nach ${noteName(b.midi)} ${handName(a.hand)}`);
        }
      } else if (together) {
        const [left, right] = a.hand === "left" ? [a, b] : [b, a];
        if (left.midi > right.midi)
          add("cross", bar, `links ${noteName(left.midi)} über rechts ${noteName(right.midi)}`);
      }
    }
  }

  // Bars with identical onsets and pitches, grouped by which pitches are left.
  const shapes = new Map<string, Map<string, number[]>>();
  const perBar = new Map<number, ReturnType<typeof quantiseNotes>>();
  for (const q of quantiseNotes(grid, notes))
    (perBar.get(q.bar) ?? perBar.set(q.bar, []).get(q.bar)!).push(q);
  for (const [bar, qs] of perBar) {
    const shape = [...new Set(qs.map((q) => `${q.slot}:${q.midi}`))].sort().join("|");
    const left = [...new Set(qs.filter((q) => q.hand === "left").map((q) => q.midi))]
      .sort((x, y) => x - y)
      .join(",");
    const groups = shapes.get(shape) ?? shapes.set(shape, new Map()).get(shape)!;
    (groups.get(left) ?? groups.set(left, []).get(left)!).push(bar + 1);
  }
  for (const groups of shapes.values()) {
    if (groups.size < 2) continue;
    const majority = [...groups.values()].sort((x, y) => y.length - x.length)[0]!;
    for (const bars of groups.values()) {
      if (bars === majority) continue;
      for (const bar of bars)
        add("inconsistent", bar, `gleiche Noten wie Takt ${majority[0]}, andere Hände`);
    }
  }

  return [...found.values()].sort((a, b) => a.bar - b.bar || a.kind.localeCompare(b.kind));
}

function beatInBar(grid: Grid, bar: number, time: number): number {
  return timeToBeat(grid, time) - barStartBeat(grid, bar);
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

// "G#3" for 56. Sharps only, the benchmark does not know the key.
export function noteName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// 56 for "G#3", "Ab3" or "56".
export function noteNumber(name: string): number {
  if (/^\d+$/.test(name)) return Number(name);
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`Unknown note name: ${name}`);
  const [, letter, accidental, octave] = match as unknown as [string, string, string, string];
  const base = NAMES.indexOf(letter as (typeof NAMES)[number]);
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return 12 * (Number(octave) + 1) + base + shift;
}

export function handName(hand: Hand): string {
  return hand === "left" ? "links" : "rechts";
}
