import { describe, expect, test } from "vite-plus/test";
import { scoreParts } from "../src/lib/benchmark";

const part = (fromBar: number, toBar: number, barsPerBlock: 2 | 4 | 8 = 4) => ({
  name: "x",
  fromBar,
  toBar,
  barsPerBlock,
});

describe("benchmark score", () => {
  test("identical boundaries score 100 whatever the names", () => {
    const reference = [part(1, 8), part(9, 24), part(25, 30, 2), part(31, 34)];
    const candidate = reference.map((p) => ({ ...p, name: "y" }));
    expect(scoreParts(candidate, reference).score).toBe(100);
  });

  test("a shifted boundary costs a start on both sides and misaligns blocks", () => {
    const reference = [part(1, 8), part(9, 24), part(25, 30, 2), part(31, 34)];
    const candidate = [part(1, 8), part(9, 24), part(25, 32), part(33, 34, 2)];
    const score = scoreParts(candidate, reference);
    expect(score.missing).toEqual([31]);
    expect(score.extra).toEqual([33]);
    expect(score.recall).toBe(0.75);
    expect(score.score).toBeLessThan(100);
    expect(score.score).toBeGreaterThan(50);
  });
});
