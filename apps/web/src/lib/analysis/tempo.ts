// Tempo and offset from note onsets. Synthesia covers are rendered from MIDI, so
// every onset sits on a sixteenth grid and the right tempo has near zero error.
// Transcribed audio adds jitter, so the grid phase is estimated per candidate
// and the error is taken relative to the grid width.

export type TempoResult = { bpm: number; offsetSec: number };

const MIN_BPM = 40;
const MAX_BPM = 200;
const STEP = 0.5;
// Error is measured relative to the grid width, otherwise a finer grid always
// wins on transcribed audio with 10 ms jitter. Below this the fit is "exact".
const ERROR_FLOOR = 0.01;

export function detectTempo(onsets: readonly number[]): TempoResult {
  const sorted = [...onsets].sort((a, b) => a - b);
  const first = sorted[0];
  if (first === undefined) return { bpm: 120, offsetSec: 0 };

  const candidates: { bpm: number; error: number; phase: number }[] = [];
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += STEP) {
    const grid = 15 / bpm;
    const phase = bestPhase(sorted, grid);
    let sum = 0;
    for (const t of sorted) {
      const d = t - phase;
      sum += Math.abs(d - Math.round(d / grid) * grid);
    }
    candidates.push({ bpm, error: sum / sorted.length / grid, phase });
  }
  const min = Math.min(...candidates.map((c) => c.error));
  const threshold = Math.max(min * 1.1, ERROR_FLOOR);
  const close = candidates.filter((c) => c.error <= threshold);
  const inRange = close.filter((c) => c.bpm >= 60 && c.bpm <= 140);
  // Halves and doubles of the true tempo fit the grid equally well. Prefer the
  // candidate nearest a typical tempo, otherwise the slowest plausible one.
  const pick =
    inRange.length > 0
      ? inRange.reduce((best, c) => (Math.abs(c.bpm - 100) < Math.abs(best.bpm - 100) ? c : best))
      : close.reduce((best, c) => (c.bpm < best.bpm ? c : best));
  // Bar 1 starts on the grid point nearest the first onset. A grace note or a
  // slightly early first chord no longer shifts the whole grid.
  const grid = 15 / pick.bpm;
  const offsetSec = pick.phase + Math.round((first - pick.phase) / grid) * grid;
  return { bpm: pick.bpm, offsetSec };
}

// Grid phase that the onsets agree on most: circular mean of onset times
// modulo the grid. Independent of which note happens to come first.
function bestPhase(onsets: readonly number[], grid: number): number {
  let x = 0;
  let y = 0;
  for (const t of onsets) {
    const angle = ((t % grid) / grid) * 2 * Math.PI;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  const angle = Math.atan2(y, x);
  return ((angle < 0 ? angle + 2 * Math.PI : angle) / (2 * Math.PI)) * grid;
}

// Round a tempo event to the half BPM the detector would produce.
export function roundBpm(bpm: number): number {
  return Math.round(bpm * 2) / 2;
}
