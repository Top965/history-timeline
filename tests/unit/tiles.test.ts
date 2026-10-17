import { describe, expect, it } from "vitest";
import { activeLevels, isValidTile, tileRange, tilesForView } from "@/lib/timeline/tiles";

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

  it("adds decades below 70 years and single years below 8", () => {
    expect(activeLevels(380)).toEqual([2, 3]);
    expect(activeLevels(50)).toEqual([2, 3, 4]);
    expect(activeLevels(6)).toEqual([2, 3, 4, 5]);
    const years = tilesForView({ center: 1969, span: 6 }, 2026).filter((t) => t.level === 5);
    expect(years.map((t) => t.tile)).toEqual([1965, 1966, 1967, 1968, 1969, 1970, 1971, 1972, 1973]);
  });

  it("never asks beyond the timeline's ends", () => {
    expect(isValidTile(3, 21, 2026)).toBe(false);
    expect(isValidTile(3, 20, 2026)).toBe(true);
    expect(isValidTile(3, -37, 2026)).toBe(false);
    expect(isValidTile(6, 1, 2026)).toBe(false);
    expect(isValidTile(5, 2027, 2026)).toBe(true);
    expect(isValidTile(5, 2037, 2026)).toBe(false);
    expect(isValidTile(3, 1.5, 2026)).toBe(false);
  });
});
