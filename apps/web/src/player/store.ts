import { create } from "zustand";

export type Loop = { fromBar: number; toBar: number; label: string };

// UI-facing playback state. The engine owns the exact position on the audio
// clock; currentBar is mirrored here only when it changes.
type PlayerState = {
  playing: boolean;
  currentBar: number;
  tempoPercent: number;
  muted: { left: boolean; right: boolean };
  loop: Loop | null;
  metronome: boolean;
  set: (patch: Partial<Omit<PlayerState, "set">>) => void;
};

export const TEMPO_MIN = 30;
export const TEMPO_MAX = 120;
export const TEMPO_STEP = 10;

export const usePlayer = create<PlayerState>((set) => ({
  playing: false,
  currentBar: 1,
  tempoPercent: 100,
  muted: { left: false, right: false },
  loop: null,
  metronome: false,
  set: (patch) => set(patch),
}));
