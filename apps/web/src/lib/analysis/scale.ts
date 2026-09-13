import type { Note } from "../notes";

export type Scale = { root: number; mode: "major" | "minor"; pitchClasses: ReadonlySet<number> };

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

const SHARP_NAMES = ["C", "Cis", "D", "Dis", "E", "F", "Fis", "G", "Gis", "A", "Ais", "H"];
const FLAT_NAMES = ["C", "Des", "D", "Es", "E", "F", "Ges", "G", "As", "A", "B", "H"];
// Relative major roots written with sharps; everything else except C uses flats.
const SHARP_MAJORS = new Set([7, 2, 9, 4, 11, 6]);

export function scalePitchClasses(root: number, mode: Scale["mode"]): Set<number> {
  const steps = mode === "major" ? MAJOR : MINOR;
  return new Set(steps.map((s) => (root + s) % 12));
}

// Counts pitch classes weighted by duration and picks the major or minor scale
// with the most hits. Relative keys share their pitch classes, so ties go to the
// root that carries more weight in the left hand, then overall.
export function detectScale(notes: readonly Note[]): Scale {
  const weight = Array.from({ length: 12 }, () => 0);
  const bassWeight = Array.from({ length: 12 }, () => 0);
  for (const n of notes) {
    const pc = n.midi % 12;
    weight[pc]! += n.duration;
    if (n.hand === "left") bassWeight[pc]! += n.duration;
  }
  let best: Scale | null = null;
  let bestScore = -1;
  for (const mode of ["major", "minor"] as const) {
    for (let root = 0; root < 12; root++) {
      const pitchClasses = scalePitchClasses(root, mode);
      let hits = 0;
      for (let pc = 0; pc < 12; pc++) if (pitchClasses.has(pc)) hits += weight[pc]!;
      const score = hits * 1e6 + bassWeight[root]! * 1e3 + weight[root]!;
      if (score > bestScore) {
        bestScore = score;
        best = { root, mode, pitchClasses };
      }
    }
  }
  return best ?? { root: 0, mode: "major", pitchClasses: scalePitchClasses(0, "major") };
}

// German spelling: sharp keys Cis Dis Fis Gis Ais, flat keys Des Es Ges As B, H for B natural.
export function pitchClassName(pc: number, scale: Pick<Scale, "root" | "mode">): string {
  const relativeMajor = scale.mode === "major" ? scale.root : (scale.root + 3) % 12;
  const names = SHARP_MAJORS.has(relativeMajor) ? SHARP_NAMES : FLAT_NAMES;
  return names[((pc % 12) + 12) % 12]!;
}

export function scaleName(scale: Scale): string {
  return pitchClassName(scale.root, scale) + (scale.mode === "minor" ? "m" : "");
}

// Name with octave for the prompt, e.g. D4 (MIDI 62).
export function noteName(midi: number, scale: Pick<Scale, "root" | "mode">): string {
  return `${pitchClassName(midi % 12, scale)}${Math.floor(midi / 12) - 1}`;
}
