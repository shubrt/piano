import type { Hand, Note } from "./notes";

// Fingering per hand after Parncutt et al. (1997): every finger sequence has a
// cost from a handful of rules (span between fingers, weak fingers, thumb on
// black keys, crossing the thumb), and dynamic programming over the note
// sequence picks the cheapest one. Deterministic, milliseconds, and each rule
// is a line in this file.

export type Finger = 1 | 2 | 3 | 4 | 5;

// Notes that start within this window count as one chord.
const CHORD_WINDOW_SEC = 0.03;
const IMPOSSIBLE = 1000;
// Moving the whole hand to a new position, Parncutt's price for a full change.
const POSITION_CHANGE = 3;
// Same finger on a new key. Fine for slow octaves, never while the key is held.
const SAME_FINGER = 6;

// Span limits in semitones per finger pair for the right hand (lower finger
// first): MinPrac, MinComf, MinRel, MaxRel, MaxComf, MaxPrac. Left hand is the
// mirror image, so intervals are negated there.
const SPANS: Record<string, [number, number, number, number, number, number]> = {
  "1-2": [-10, -8, 1, 5, 8, 10],
  "1-3": [-8, -6, 3, 8, 10, 12],
  "1-4": [-6, -4, 5, 8, 10, 12],
  "1-5": [-2, 0, 7, 10, 12, 14],
  "2-3": [1, 1, 1, 2, 3, 5],
  "2-4": [1, 1, 3, 4, 5, 7],
  "2-5": [2, 2, 5, 6, 8, 10],
  "3-4": [1, 1, 1, 2, 2, 4],
  "3-5": [1, 1, 3, 4, 5, 7],
  "4-5": [1, 1, 1, 2, 3, 5],
};

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (midi: number) => BLACK.has(midi % 12);

// Cost of playing pitch b with finger fb right after pitch a with finger fa.
// `held` means a is still sounding when b starts, so its finger is busy.
// Standing costs of fb itself are added once per note in chordCost.
function pairCost(hand: Hand, a: number, fa: Finger, b: number, fb: Finger, held: boolean): number {
  if (fa === fb) {
    // Same finger again is free on the same key, awkward on a different one,
    // impossible while the first key is still down.
    if (a === b) return 0;
    return held ? IMPOSSIBLE : SAME_FINGER;
  }
  // Orient so that the lower-numbered finger comes first; for the left hand
  // a rising finger number means a falling pitch.
  const up = hand === "right" ? b - a : a - b;
  const [lo, hi, d] = fa < fb ? [fa, fb, up] : [fb, fa, -up];
  const [, minComf, minRel, maxRel, maxComf, maxPrac] = SPANS[`${lo}-${hi}`]!;
  const thumb = lo === 1 ? 1 : 2;
  const alternation = (fa === 3 && fb === 4) || (fa === 4 && fb === 3) ? 1 : 0;
  // Beyond the practical span the hand has to jump anyway. Flat price, more if
  // the fingers land in the wrong order for the direction, and a little more
  // for every inner finger involved: a jump leaves from and lands on the edge
  // of the hand.
  if (Math.abs(d) > maxPrac) {
    const inner = (fa === 1 || fa === 5 ? 0 : 1) + (fb === 1 || fb === 5 ? 0 : 1);
    return POSITION_CHANGE + (d < 0 ? POSITION_CHANGE : 0) + inner + alternation;
  }
  // Crossing: another finger reaching over the thumb, or the thumb under.
  const crossing = (fa === 1 && d < 0) || (fb === 1 && d < 0) ? POSITION_CHANGE : 0;
  // Staying in position: stretch and span rules.
  let inPosition = 0;
  if (d > maxComf) inPosition += 2 * (d - maxComf);
  if (d < minComf) inPosition += 2 * (minComf - d);
  if (d < minRel) inPosition += thumb * (minRel - d);
  if (d > maxRel) inPosition += thumb * (d - maxRel);
  // Or shift the hand so the fingers sit comfortably: flat price plus the
  // distance the hand has to move.
  const shift = POSITION_CHANGE + Math.max(0, minRel - d, d - maxRel);
  return Math.min(inPosition, shift) + crossing + alternation;
}

// Standing costs of a finger on a key: weak fingers, thumb and pinky on black keys.
function fingerCost(f: Finger, midi: number): number {
  let cost = 0;
  if (f === 4) cost += 1;
  if (f === 5) cost += 0.5;
  if (isBlack(midi) && (f === 1 || f === 5)) cost += 1;
  return cost;
}

type Event = { indices: number[]; pitches: number[]; time: number; releases: number[] };

// Groups the notes of one hand into chords, pitches ascending.
function eventsOf(notes: readonly Note[], indices: readonly number[]): Event[] {
  const events: Event[] = [];
  for (const i of indices) {
    const note = notes[i]!;
    const last = events[events.length - 1];
    const lastNote = last ? notes[last.indices[0]!]! : null;
    if (last && lastNote && Math.abs(note.time - lastNote.time) < CHORD_WINDOW_SEC) {
      last.indices.push(i);
    } else {
      events.push({ indices: [i], pitches: [], time: note.time, releases: [] });
    }
  }
  for (const event of events) {
    event.indices.sort((x, y) => notes[x]!.midi - notes[y]!.midi);
    event.pitches = event.indices.map((i) => notes[i]!.midi);
    event.releases = event.indices.map((i) => notes[i]!.time + notes[i]!.duration);
  }
  return events;
}

// All ways to put k fingers on k ascending pitches. Right hand: ascending
// fingers; left hand: descending fingers (thumb on top).
function combos(k: number, hand: Hand): Finger[][] {
  const out: Finger[][] = [];
  const pick = (start: number, acc: Finger[]) => {
    if (acc.length === k) {
      out.push(hand === "right" ? [...acc] : [...acc].reverse());
      return;
    }
    for (let f = start; f <= 5; f++) pick(f + 1, [...acc, f as Finger]);
  };
  pick(1, []);
  return out;
}

function chordCost(hand: Hand, pitches: number[], fingers: Finger[]): number {
  let cost = 0;
  for (let i = 0; i < pitches.length; i++) {
    cost += fingerCost(fingers[i]!, pitches[i]!);
    if (i > 0)
      cost += pairCost(hand, pitches[i - 1]!, fingers[i - 1]!, pitches[i]!, fingers[i]!, true);
  }
  return cost;
}

// Average pair cost between every note of one chord and every note of the next.
function transitionCost(hand: Hand, a: Event, fa: Finger[], b: Event, fb: Finger[]): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.pitches.length; i++) {
    for (let j = 0; j < b.pitches.length; j++) {
      const held = a.releases[i]! > b.time + CHORD_WINDOW_SEC;
      sum += pairCost(hand, a.pitches[i]!, fa[i]!, b.pitches[j]!, fb[j]!, held);
      n++;
    }
  }
  return n ? sum / n : 0;
}

// Fingers for every note, aligned with the input array. Chords with more than
// five notes leave the extra notes without a finger.
export function assignFingering(notes: readonly Note[]): (Finger | undefined)[] {
  const result: (Finger | undefined)[] = notes.map(() => undefined);
  for (const hand of ["left", "right"] as const) {
    const indices = notes.map((n, i) => (n.hand === hand ? i : -1)).filter((i) => i >= 0);
    const events = eventsOf(notes, indices).map((e) => ({
      ...e,
      indices: e.indices.slice(0, 5),
      pitches: e.pitches.slice(0, 5),
      releases: e.releases.slice(0, 5),
    }));
    if (events.length === 0) continue;

    // Viterbi over events: best cost per finger combination, with back pointers.
    let previous: { fingers: Finger[]; cost: number; back: number }[] = combos(
      events[0]!.pitches.length,
      hand,
    ).map((fingers) => ({ fingers, cost: chordCost(hand, events[0]!.pitches, fingers), back: -1 }));
    const history = [previous];
    for (let e = 1; e < events.length; e++) {
      const event = events[e]!;
      const current = combos(event.pitches.length, hand).map((fingers) => {
        const own = chordCost(hand, event.pitches, fingers);
        let best = Infinity;
        let back = 0;
        previous.forEach((p, i) => {
          const total = p.cost + transitionCost(hand, events[e - 1]!, p.fingers, event, fingers);
          if (total < best) {
            best = total;
            back = i;
          }
        });
        return { fingers, cost: best + own, back };
      });
      history.push(current);
      previous = current;
    }
    let state = previous.reduce((best, s, i, arr) => (s.cost < arr[best]!.cost ? i : best), 0);
    for (let e = events.length - 1; e >= 0; e--) {
      const chosen = history[e]![state]!;
      events[e]!.indices.forEach((noteIndex, i) => {
        result[noteIndex] = chosen.fingers[i];
      });
      state = chosen.back;
    }
  }
  return result;
}
