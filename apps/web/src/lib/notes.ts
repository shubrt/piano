import type { Hands } from "./song";
import type { MidiTrack, ParsedMidi } from "./midi";

export type Hand = "left" | "right";

export type Note = {
  time: number;
  duration: number;
  midi: number;
  velocity: number;
  hand: Hand;
};

// Several tracks with notes: hands come from the tracks. One track: split at G4.
export function detectHands(parsed: ParsedMidi): Hands {
  return parsed.tracks.length >= 2 ? { type: "tracks" } : { type: "split", splitPitch: 67 };
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
  } else {
    const splitPitch = hands.type === "split" ? hands.splitPitch : 67;
    for (const track of parsed.tracks) {
      for (const n of track.notes)
        notes.push({ ...n, hand: n.midi < splitPitch ? "left" : "right" });
    }
  }
  return notes.sort((x, y) => x.time - y.time || x.midi - y.midi);
}

function meanPitch(track: MidiTrack): number {
  return track.notes.reduce((sum, n) => sum + n.midi, 0) / track.notes.length;
}
