// Tempo and offset from note onsets. Synthesia covers are rendered from MIDI, so
// every onset sits on a sixteenth grid and the right tempo has near zero error.

export type TempoResult = { bpm: number; offsetSec: number };

const MIN_BPM = 40;
const MAX_BPM = 200;
const STEP = 0.5;
// Errors below this count as "on the grid"; the Secunda MIDI has sub 5 ms jitter.
const ERROR_FLOOR_SEC = 0.002;

export function detectTempo(onsets: readonly number[]): TempoResult {
  const sorted = [...onsets].sort((a, b) => a - b);
  const first = sorted[0];
  if (first === undefined) return { bpm: 120, offsetSec: 0 };
  const relative = sorted.map((t) => t - first);

  const candidates: { bpm: number; error: number }[] = [];
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += STEP) {
    const grid = 15 / bpm;
    let sum = 0;
    for (const t of relative) sum += Math.abs(t - Math.round(t / grid) * grid);
    candidates.push({ bpm, error: sum / relative.length });
  }
  const min = Math.min(...candidates.map((c) => c.error));
  const threshold = Math.max(min * 1.1, ERROR_FLOOR_SEC);
  const close = candidates.filter((c) => c.error <= threshold);
  const inRange = close.filter((c) => c.bpm >= 60 && c.bpm <= 140);
  // Halves and doubles of the true tempo fit the grid equally well. Prefer the
  // candidate nearest a typical tempo, otherwise the slowest plausible one.
  const pick =
    inRange.length > 0
      ? inRange.reduce((best, c) => (Math.abs(c.bpm - 100) < Math.abs(best.bpm - 100) ? c : best))
      : close.reduce((best, c) => (c.bpm < best.bpm ? c : best));
  return { bpm: pick.bpm, offsetSec: first };
}

// Round a tempo event to the half BPM the detector would produce.
export function roundBpm(bpm: number): number {
  return Math.round(bpm * 2) / 2;
}
