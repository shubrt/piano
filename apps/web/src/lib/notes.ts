import { assignAuto } from "./hands";
import type { MidiTrack, ParsedMidi } from "./midi";
import type { HandOverrides, Hands } from "./song";

export { MAX_HAND_SPAN } from "./hands";

export type Hand = "left" | "right";

export type Note = {
  time: number;
  duration: number;
  midi: number;
  velocity: number;
  hand: Hand;
};

// Several tracks with notes: hands come from the tracks. One track: found per note.
export function detectHands(parsed: ParsedMidi): Hands {
  return parsed.tracks.length >= 2 ? { type: "tracks" } : { type: "auto" };
}

export function allOnsets(parsed: ParsedMidi): number[] {
  return parsed.tracks.flatMap((t) => t.notes.map((n) => n.time));
}

export function assignHands(parsed: ParsedMidi, hands: Hands): Note[] {
  const notes: Note[] = [];
  if (hands.type === "tracks" && parsed.tracks.length >= 2) {
    // The two busiest tracks are the hands. Their mean pitches define a midpoint;
    // any extra track (ornaments, pedal notes) joins the side its mean pitch falls on.
    const [a, b] = [...parsed.tracks].sort((x, y) => y.notes.length - x.notes.length) as [
      MidiTrack,
      MidiTrack,
    ];
    const midpoint = (meanPitch(a) + meanPitch(b)) / 2;
    for (const track of parsed.tracks) {
      const hand: Hand = meanPitch(track) >= midpoint ? "right" : "left";
      for (const n of track.notes) notes.push({ ...n, hand });
    }
  } else if (hands.type === "split") {
    for (const track of parsed.tracks) {
      for (const n of track.notes)
        notes.push({ ...n, hand: n.midi < hands.splitPitch ? "left" : "right" });
    }
  } else {
    const flat = parsed.tracks.flatMap((t) => t.notes);
    const auto = assignAuto(flat);
    flat.forEach((n, i) => notes.push({ ...n, hand: auto[i]! }));
  }
  return notes.sort((x, y) => x.time - y.time || x.midi - y.midi);
}

// A note's identity across reloads: pitch and onset in milliseconds.
export function noteKey(note: { midi: number; time: number }): string {
  return `${note.midi}@${Math.round(note.time * 1000)}`;
}

// The hands from assignHands with the user's overrides on top. Order is kept.
export function withHandOverrides(notes: readonly Note[], overrides: HandOverrides = {}): Note[] {
  return notes.map((n) => {
    const hand = overrides[noteKey(n)];
    return hand && hand !== n.hand ? { ...n, hand } : n;
  });
}

function meanPitch(track: MidiTrack): number {
  return track.notes.reduce((sum, n) => sum + n.midi, 0) / track.notes.length;
}
