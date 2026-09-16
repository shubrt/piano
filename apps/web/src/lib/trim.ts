import { MAX_HAND_SPAN, type Note } from "./notes";

// Two onsets closer than this are one chord, not one note after another.
const CHORD_SEC = 0.05;

// Display lengths for notes whose MIDI durations mean "how long the string
// rang" rather than "how long the key was down" (Transkun extends offsets to
// the pedal release). A note ends at the next onset of the same hand when the
// hand cannot hold both: same pitch struck again, or further apart than
// MAX_HAND_SPAN. With `pedal` every later onset of the same hand ends it, only
// chord tones struck together stay. Order and count of the notes are kept, so
// indices still line up with the untrimmed list. Playback should use the
// original durations.
export function trimForDisplay(notes: readonly Note[], pedal: boolean): Note[] {
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  return notes.map((note) => {
    let end = note.time + note.duration;
    for (const later of sorted) {
      if (later.time >= end) break;
      if (later.hand !== note.hand || later.time - note.time < CHORD_SEC) continue;
      const cannotHold =
        pedal || later.midi === note.midi || Math.abs(later.midi - note.midi) > MAX_HAND_SPAN;
      if (cannotHold) {
        end = later.time;
        break;
      }
    }
    return end === note.time + note.duration ? note : { ...note, duration: end - note.time };
  });
}
