import type { Hand } from "./notes";

// Notes one hand holds at the same time span at most an octave plus a third.
export const MAX_HAND_SPAN = 14;

// Two onsets closer than this are struck together.
const CHORD_SEC = 0.05;
// Semitones a hand covers without moving, and how the cost of moving further
// scales with the time available: a semitone in SPEED_SEC costs 1.
const REACH = 5;
const SPEED_SEC = 0.12;
// Consecutive notes in different hands cost this, a line stays in one hand
// unless moving is more expensive. Not applied to chord tones (a chord often
// is the other hand coming in), after a two-hand chord, or after a rest
// longer than SWITCH_WINDOW.
const SWITCH = 10;
const SWITCH_WINDOW = 0.6;
// Struck together in one hand but wider than MAX_HAND_SPAN, or the left hand
// above the right hand at the same time.
const SPAN_VIOLATION = 40;
const CROSS = 30;
// Per semitone the left hand plays above, or the right hand below, the
// comfortable side of the song's median pitch.
const REGISTER = 1.2;
const COMFORT = 5;
const BEAM = 48;

type TimedNote = { time: number; midi: number };

// Where a hand is: its last strike and the chord that strike belongs to.
type HandState = { time: number; midi: number; low: number; high: number } | null;

type State = {
  left: HandState;
  right: HandState;
  // Hand of the previous note, null after a chord split over both hands.
  last: Hand | null;
  lastTime: number;
  cost: number;
  path: Path;
};
type Path = { hand: Hand; parent: Path | null } | null;

// Hands for one MIDI track. Every note goes to the hand that reaches it most
// cheaply: little movement in the time available, no impossible grips, no
// crossed hands, lines stay in one hand, and each hand prefers its own
// register. A beam search over the time-sorted notes keeps the best partial
// assignments, so a later chord can still pull an earlier ambiguous note to
// the other hand.
export function assignAuto(notes: readonly TimedNote[]): Hand[] {
  if (notes.length === 0) return [];
  const order = notes
    .map((_, i) => i)
    .sort((a, b) => notes[a]!.time - notes[b]!.time || notes[a]!.midi - notes[b]!.midi);
  const center = median(notes.map((n) => n.midi));
  const chord = chordTones(notes, order);

  let beam: State[] = [
    { left: null, right: null, last: null, lastTime: -Infinity, cost: 0, path: null },
  ];
  for (const [k, index] of order.entries()) {
    const note = notes[index]!;
    const next = new Map<string, State>();
    for (const state of beam) {
      for (const hand of ["left", "right"] as const) {
        const candidate = step(state, note, hand, center, chord[k]!);
        const key = stateKey(candidate);
        const existing = next.get(key);
        if (!existing || candidate.cost < existing.cost) next.set(key, candidate);
      }
    }
    beam = [...next.values()].sort((a, b) => a.cost - b.cost).slice(0, BEAM);
  }

  const hands: Hand[] = Array.from({ length: notes.length }, () => "left");
  let path = beam[0]!.path;
  for (let k = order.length - 1; k >= 0; k--) {
    hands[order[k]!] = path!.hand;
    path = path!.parent;
  }
  return hands;
}

// Cost of a given assignment under the same model. Cheaper than what
// assignAuto found means the beam pruned the better path, more expensive means
// the model itself prefers the wrong hands.
export function assignmentCost(notes: readonly TimedNote[], hands: readonly Hand[]): number {
  const order = notes
    .map((_, i) => i)
    .sort((a, b) => notes[a]!.time - notes[b]!.time || notes[a]!.midi - notes[b]!.midi);
  const center = median(notes.map((n) => n.midi));
  const chord = chordTones(notes, order);
  let state: State = {
    left: null,
    right: null,
    last: null,
    lastTime: -Infinity,
    cost: 0,
    path: null,
  };
  for (const [k, index] of order.entries())
    state = step(state, notes[index]!, hands[index]!, center, chord[k]!);
  return state.cost;
}

// Per position in `order`: does another note sound within CHORD_SEC.
function chordTones(notes: readonly TimedNote[], order: readonly number[]): boolean[] {
  return order.map((index, k) => {
    const t = notes[index]!.time;
    const prev = order[k - 1];
    const next = order[k + 1];
    return (
      (prev !== undefined && t - notes[prev]!.time < CHORD_SEC) ||
      (next !== undefined && notes[next]!.time - t < CHORD_SEC)
    );
  });
}

function step(state: State, note: TimedNote, hand: Hand, center: number, chord: boolean): State {
  const own = hand === "left" ? state.left : state.right;
  const other = hand === "left" ? state.right : state.left;
  let cost = state.cost;
  let updated: HandState;

  if (own === null) {
    updated = { time: note.time, midi: note.midi, low: note.midi, high: note.midi };
  } else if (note.time - own.time < CHORD_SEC) {
    const low = Math.min(own.low, note.midi);
    const high = Math.max(own.high, note.midi);
    if (high - low > MAX_HAND_SPAN) cost += SPAN_VIOLATION;
    updated = { time: note.time, midi: note.midi, low, high };
  } else {
    // Moving far is only expensive when it has to be fast.
    const speed = Math.min(4, SPEED_SEC / (note.time - own.time));
    cost += Math.max(0, Math.abs(note.midi - own.midi) - REACH) * speed;
    updated = { time: note.time, midi: note.midi, low: note.midi, high: note.midi };
  }

  if (other !== null && note.time - other.time < CHORD_SEC) {
    const crossed = hand === "left" ? note.midi > other.low : note.midi < other.high;
    if (crossed) cost += CROSS;
  }

  cost +=
    hand === "left"
      ? Math.max(0, note.midi - (center + COMFORT)) * REGISTER
      : Math.max(0, center - COMFORT - note.midi) * REGISTER;

  const gap = note.time - state.lastTime;
  const together = gap < CHORD_SEC;
  if (state.last !== null && state.last !== hand && !together && !chord && gap < SWITCH_WINDOW)
    cost += SWITCH;
  const last = together && state.last !== hand ? null : hand;

  return {
    left: hand === "left" ? updated : state.left,
    right: hand === "right" ? updated : state.right,
    last,
    lastTime: note.time,
    cost,
    path: { hand, parent: state.path },
  };
}

function stateKey(s: State): string {
  const h = (x: HandState) =>
    x ? `${x.midi}:${x.low}:${x.high}:${Math.round(x.time * 1000)}` : "-";
  return `${h(s.left)}|${h(s.right)}|${s.last ?? "-"}`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 60;
}
