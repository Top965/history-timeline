import { describe, expect, it } from "vitest";
import { isValidTile, tileRange, tilesForView } from "@/lib/timeline/tiles";

describe("timeline tiles", () => {
  it("covers fixed stretches of time", () => {
    expect(tileRange(3, 19)).toEqual({ from: 1900, to: 1999 });
    expect(tileRange(2, -2)).toEqual({ from: -2000, to: -1001 });
  });

  it("asks for nothing when zoomed far out", () => {
    expect(tilesForView({ center: 0, span: 6000 }, 2026)).toEqual([]);
  });

  it("asks for medium events only below 4,000 years and small ones below 700", () => {
    const mid = tilesForView({ center: 1000, span: 2000 }, 2026);
    expect(new Set(mid.map((t) => t.level))).toEqual(new Set([2]));
    expect(mid.map((t) => t.tile)).toEqual([-1, 0, 1, 2]);

    const close = tilesForView({ center: 1950, span: 100 }, 2026);
    expect(close.filter((t) => t.level === 3).map((t) => t.tile)).toEqual([18, 19, 20]);
  });

  it("never asks beyond the timeline's ends", () => {
    expect(isValidTile(3, 21, 2026)).toBe(false);
    expect(isValidTile(3, 20, 2026)).toBe(true);
    expect(isValidTile(3, -37, 2026)).toBe(false);
    expect(isValidTile(4, 1, 2026)).toBe(false);
    expect(isValidTile(3, 1.5, 2026)).toBe(false);
  });
});
