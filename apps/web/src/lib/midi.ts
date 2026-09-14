import { Midi } from "@tonejs/midi";

export type MidiNote = {
  time: number;
  duration: number;
  midi: number;
  velocity: number;
};

export type MidiTrack = { name: string; notes: MidiNote[] };

export type ParsedMidi = {
  // BPM of the first tempo event, null when the file has none.
  tempoBpm: number | null;
  tracks: MidiTrack[];
};

// Note times are derived from ticks at one constant tempo (the first tempo event,
// or 120 BPM without one). Files exported from notation software carry tempo
// curves and ritardandi that would pull notes off the bar grid otherwise.
export function parseMidi(bytes: Uint8Array): ParsedMidi {
  const midi = new Midi(repairMidi(bytes));
  const firstTempo = midi.header.tempos[0]?.bpm ?? null;
  const bpm = firstTempo ?? 120;
  const secPerTick = 60 / bpm / midi.header.ppq;
  const tracks = midi.tracks
    .filter((track) => track.notes.length > 0)
    .map((track) => ({
      name: track.name,
      notes: track.notes.map((note) => ({
        time: note.ticks * secPerTick,
        duration: Math.max(note.durationTicks, 1) * secPerTick,
        midi: note.midi,
        velocity: note.velocity,
      })),
    }));
  return { tempoBpm: firstTempo, tracks };
}

// Some exporters write the time_signature meta event with a 2-byte payload
// instead of 4. The parser rejects that, so pad the event to 4 bytes and fix
// the enclosing track length. FF as a status byte only occurs on meta events,
// so a plain byte search is safe.
export function repairMidi(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let changed = false;
  let pos = 0;
  const readU32 = (at: number) =>
    ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
  while (pos + 8 <= bytes.length) {
    const len = readU32(pos + 4);
    const isTrack =
      bytes[pos] === 0x4d &&
      bytes[pos + 1] === 0x54 &&
      bytes[pos + 2] === 0x72 &&
      bytes[pos + 3] === 0x6b;
    const body = bytes.subarray(pos + 8, pos + 8 + len);
    const repaired = isTrack ? repairTrackBody(body) : body;
    if (repaired !== body) changed = true;
    const header = new Uint8Array(8);
    header.set(bytes.subarray(pos, pos + 4));
    new DataView(header.buffer).setUint32(4, repaired.length);
    chunks.push(header, repaired);
    pos += 8 + len;
  }
  if (!changed) return bytes;
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function repairTrackBody(body: Uint8Array): Uint8Array {
  const parts: number[] = [];
  let changed = false;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === 0xff && body[i + 1] === 0x58 && body[i + 2] === 0x02) {
      parts.push(0xff, 0x58, 0x04, body[i + 3]!, body[i + 4]!, 0x18, 0x08);
      i += 4;
      changed = true;
    } else {
      parts.push(body[i]!);
    }
  }
  return changed ? new Uint8Array(parts) : body;
}
