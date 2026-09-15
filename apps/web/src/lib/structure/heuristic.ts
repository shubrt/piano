import type { NoteAnalysis } from "../analysis";
import type { Structure } from "./schema";

// Deterministic structure detection, the local alternative to the model.
//
// Two passes over the bar table. The first follows the accompaniment: bars
// repeat every PERIOD bars in left-hand fingerprint or bass note, a part ends
// where a whole block stops matching, and a pattern that only lines up after
// skipping one or two bars turns those bars into a transition. The second pass
// cuts each accompaniment part into phrases where the right hand stops
// repeating earlier blocks. Names follow the bass family of each part.

const PERIOD = 4;
// Mean bar similarity a block needs to count as continuing the pattern.
const IN_PATTERN = 0.5;
// Longest phase shift tried before a pattern; the skipped bars become a transition.
const MAX_SHIFT = 2;

type Bar = { left: string; right: string; bassMidi: number | null };
type Span = { fromBar: number; toBar: number; kind: "pattern" | "free" | "transition" };

export function segmentStructure(
  analysis: NoteAnalysis,
  beatsPerBar: Structure["beatsPerBar"],
): Structure {
  const bars: Bar[] = analysis.summaries.map((s, i) => ({
    left: analysis.fingerprints.left[i] ?? "",
    right: analysis.fingerprints.right[i] ?? "",
    bassMidi: s.bassMidi,
  }));
  const spans = accompanimentSpans(bars).flatMap((span) => phrasesOf(span, bars));
  return { beatsPerBar, parts: nameParts(spans, bars), notes: "" };
}

// How alike two bars are as accompaniment: same left hand beats same bass note
// beats same bass pitch class in another octave.
function similarity(a: Bar, b: Bar): number {
  if (a.left === b.left) return 1;
  if (a.bassMidi === null || b.bassMidi === null) return 0;
  if (a.bassMidi === b.bassMidi) return 0.75;
  return a.bassMidi % 12 === b.bassMidi % 12 ? 0.25 : 0;
}

// Mean similarity of bars [from, from + count) to the bars lag away. Pairs past
// the end of the song count as zero, so a short tail cannot outscore a full block.
function patternStrength(bars: Bar[], from: number, count: number, lag: number): number {
  let sum = 0;
  for (let i = from; i < from + count; i++) {
    const other = bars[i + lag];
    const bar = bars[i];
    if (bar && other) sum += similarity(bar, other);
  }
  return sum / count;
}

// Pass one. Indices are 0-based here, bar numbers 1-based in the result.
function accompanimentSpans(bars: Bar[]): Span[] {
  const spans: Span[] = [];
  const total = bars.length;
  let start = 0;
  while (start < total) {
    const shift = bestShift(bars, start);
    if (shift === null) {
      // No pattern here: the free stretch runs until one starts again, and it
      // swallows the bars a later pattern skips instead of making a transition.
      let end = start + 1;
      while (end < total && bestShift(bars, end) === null) end++;
      if (end < total) end += bestShift(bars, end) ?? 0;
      spans.push({ fromBar: start + 1, toBar: end, kind: "free" });
      start = end;
      continue;
    }
    if (shift > 0) {
      spans.push({ fromBar: start + 1, toBar: start + shift, kind: "transition" });
      start += shift;
    }
    // Two blocks are in the pattern by construction; extend block by block.
    let end = Math.min(total, start + 2 * PERIOD);
    while (end < total) {
      const count = Math.min(PERIOD, total - end);
      if (patternStrength(bars, end, count, -PERIOD) < IN_PATTERN) break;
      end += count;
    }
    spans.push({ fromBar: start + 1, toBar: end, kind: "pattern" });
    start = end;
  }
  return spans;
}

function remaining(total: number, index: number): number {
  return total - index;
}

// Phase shift (0 to MAX_SHIFT) at which a pattern starts, or null when none does.
// A pattern starts on a bar that recurs one period later, so the block grid
// sits on the bass pattern. Prefers the strongest pattern, on ties the earlier start.
function bestShift(bars: Bar[], start: number): number | null {
  let best: { shift: number; strength: number } | null = null;
  for (let shift = 0; shift <= MAX_SHIFT; shift++) {
    const first = bars[start + shift];
    const recurrence = bars[start + shift + PERIOD];
    if (remaining(bars.length, start + shift) < PERIOD + 2 || !first || !recurrence) break;
    if (similarity(first, recurrence) < 0.75) continue;
    const strength = patternStrength(bars, start + shift, PERIOD, PERIOD);
    if (strength >= IN_PATTERN && (!best || strength > best.strength)) best = { shift, strength };
  }
  return best?.shift ?? null;
}

// Pass two: phrases inside one span. Blocks of PERIOD bars, compared by their
// right-hand fingerprints. A block sequence that repeats with lag m blocks
// yields phrases of m blocks; otherwise a phrase is a fresh block plus the
// blocks that repeat one of its blocks. Phrases have at least two blocks.
function phrasesOf(span: Span, bars: Bar[]): Span[] {
  const length = span.toBar - span.fromBar + 1;
  if (span.kind === "transition" || length < 2 * PERIOD) return [span];
  const blocks: number[][] = [];
  for (let from = span.fromBar - 1; from < span.toBar; from += PERIOD) {
    blocks.push(range(from, Math.min(from + PERIOD, span.toBar)));
  }
  const repeats = (a: number[], b: number[]) => {
    const n = Math.min(a.length, b.length);
    let equal = 0;
    for (let i = 0; i < n; i++) if (bars[a[i]!]!.right === bars[b[i]!]!.right) equal++;
    return equal / n >= 0.5;
  };
  const groups: number[][][] = [];
  const lag = [1, 2, 4].find(
    (m) =>
      blocks.length >= 2 * m &&
      blocks.every((block, k) => k + m >= blocks.length || repeats(block, blocks[k + m]!)),
  );
  if (lag === 1) {
    groups.push(blocks);
  } else if (lag !== undefined) {
    for (let k = 0; k < blocks.length; k += lag) groups.push(blocks.slice(k, k + lag));
  } else {
    for (const block of blocks) {
      const current = groups.at(-1);
      if (current && (current.length < 2 || current.some((b) => repeats(b, block)))) {
        current.push(block);
      } else {
        groups.push([block]);
      }
    }
  }
  // A trailing short group belongs to the phrase before it.
  const last = groups.at(-1);
  if (groups.length > 1 && last && last.length < 2) {
    groups.pop();
    groups.at(-1)!.push(...last);
  }
  return groups.map((group) => ({
    fromBar: group[0]![0]! + 1,
    toBar: group.at(-1)!.at(-1)! + 1,
    kind: span.kind,
  }));
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

// Bass pitch classes of the first block, the family a part belongs to.
function bassFamily(span: Span, bars: Bar[]): string {
  return range(span.fromBar - 1, Math.min(span.fromBar - 1 + PERIOD, span.toBar))
    .map((i) => bars[i]!.bassMidi)
    .map((m) => (m === null ? "-" : String(m % 12)))
    .join(",");
}

function nameParts(spans: Span[], bars: Bar[]): Structure["parts"] {
  const kinds = spans.map((span, i): string => {
    if (spans.length > 1 && i === 0) return "Intro";
    if (spans.length > 2 && i === spans.length - 1) return "Outro";
    if (span.kind === "transition") return "Übergang";
    if (span.kind === "free")
      return span.toBar - span.fromBar + 1 <= MAX_SHIFT ? "Übergang" : "Zwischenspiel";
    return "pattern";
  });
  // The first patterned part after the intro sets the theme family.
  const themeIndex = kinds.findIndex((k) => k === "pattern");
  const theme = themeIndex >= 0 ? bassFamily(spans[themeIndex]!, bars) : null;
  const names = kinds.map((kind, i) =>
    kind === "pattern" ? (bassFamily(spans[i]!, bars) === theme ? "Thema" : "Variation") : kind,
  );
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return spans.map((span, i) => {
    const name = names[i]!;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    const length = span.toBar - span.fromBar + 1;
    return {
      name: (counts.get(name) ?? 0) > 1 ? `${name} ${n}` : name,
      fromBar: span.fromBar,
      toBar: span.toBar,
      barsPerBlock: blockSize(length),
    };
  });
}

// Whole blocks of PERIOD where the length allows, otherwise halves for short
// even parts. A two bar transition gets blocks of two.
function blockSize(length: number): Structure["parts"][number]["barsPerBlock"] {
  if (length <= 2) return 2;
  if (length % PERIOD === 0) return 4;
  if (length % 2 === 0 && length < 2 * PERIOD) return 2;
  return 4;
}
