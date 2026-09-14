// Geometry of an 88 key keyboard (A0 = 21 to C8 = 108) for the canvas.

export const FIRST_KEY = 21;
export const LAST_KEY = 108;

const BLACK = new Set([1, 3, 6, 8, 10]);

export function isBlack(midi: number): boolean {
  return BLACK.has(midi % 12);
}

export type KeyRect = {
  midi: number;
  x: number;
  width: number;
  black: boolean;
  // Column for the falling note: the part of the key no other key covers, so
  // notes of neighbouring keys never overlap.
  noteX: number;
  noteWidth: number;
};

// White keys share the width evenly; black keys sit between them.
export function keyboardLayout(totalWidth: number): KeyRect[] {
  const whiteCount = countWhite(FIRST_KEY, LAST_KEY);
  const whiteWidth = totalWidth / whiteCount;
  const blackWidth = whiteWidth * 0.6;
  const keys: KeyRect[] = [];
  let whiteIndex = 0;
  for (let midi = FIRST_KEY; midi <= LAST_KEY; midi++) {
    if (isBlack(midi)) {
      const x = whiteIndex * whiteWidth - blackWidth / 2;
      keys.push({ midi, x, width: blackWidth, black: true, noteX: x, noteWidth: blackWidth });
    } else {
      const x = whiteIndex * whiteWidth;
      const leftCut = midi > FIRST_KEY && isBlack(midi - 1) ? blackWidth / 2 : 0;
      const rightCut = midi < LAST_KEY && isBlack(midi + 1) ? blackWidth / 2 : 0;
      keys.push({
        midi,
        x,
        width: whiteWidth,
        black: false,
        noteX: x + leftCut,
        noteWidth: whiteWidth - leftCut - rightCut,
      });
      whiteIndex++;
    }
  }
  return keys;
}

function countWhite(from: number, to: number): number {
  let n = 0;
  for (let m = from; m <= to; m++) if (!isBlack(m)) n++;
  return n;
}
