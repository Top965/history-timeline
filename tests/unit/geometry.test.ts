import { describe, expect, it } from "vitest";
import {
  clampView,
  computeTicks,
  eraAt,
  eventsAround,
  fitRange,
  interpolateView,
  layoutTrack,
  MAX_SPAN,
  MIN_SPAN,
  MIN_YEAR,
  showsAtZoom,
  viewForEvent,
  xToYear,
  yearToX,
  zoomAt,
  type TrackEvent,
} from "@/lib/timeline/geometry";

const noEmphasis = { highlighted: null, focused: new Set<string>() };
const ev = (slug: string, startYear: number, importance: 1 | 2 | 3 = 1, endYear: number | null = null): TrackEvent => ({
  slug,
  title: slug,
  startYear,
  endYear,
  importance,
});

describe("view math", () => {
  it("maps years to pixels and back around the center playhead", () => {
    const v = { center: 1900, span: 200 };
    expect(yearToX(1900, v, 800)).toBe(400);
    expect(yearToX(1800, v, 800)).toBe(0);
    expect(xToYear(800, v, 800)).toBe(2000);
  });

  it("clamps zoom and position to the allowed range", () => {
    expect(clampView({ center: -99999, span: 1 }, 2026)).toEqual({ center: MIN_YEAR, span: MIN_SPAN });
    expect(clampView({ center: 3000, span: 99999 }, 2026)).toEqual({ center: 2035, span: MAX_SPAN });
  });

  it("zooms around the pointer, keeping the year under it fixed", () => {
    const v = { center: 1900, span: 200 };
    const anchor = xToYear(600, v, 800);
    const zoomed = zoomAt(v, 600, 0.5, 800, 2026);
    expect(zoomed.span).toBe(100);
    expect(xToYear(600, zoomed, 800)).toBeCloseTo(anchor, 9);
  });

  it("interpolates span on a log scale", () => {
    const mid = interpolateView({ center: 0, span: 10 }, { center: 100, span: 1000 }, 0.5);
    expect(mid.center).toBe(50);
    expect(mid.span).toBeCloseTo(100, 9);
  });

  it("frames ranges and events", () => {
    expect(fitRange(1789, 1945)).toEqual({ center: 1867, span: (1945 - 1789) * 1.12 });
    expect(viewForEvent({ startYear: 1914, endYear: 1918 })).toEqual({ center: 1916, span: 40 });
    expect(viewForEvent({ startYear: 1347, endYear: 1351 + 20 })).toEqual({ center: 1359, span: 60 });
  });
});

describe("ticks", () => {
  it("picks a major step at least 84px apart and adds minor ticks", () => {
    const t = computeTicks({ center: 1880, span: 380 }, 800);
    expect(t.step).toBe(50);
    expect(t.major).toContain(1900);
    expect(t.major.every((y) => y % 50 === 0)).toBe(true);
    expect(t.minor).toContain(1910);
    expect(t.minor).not.toContain(1900);
  });
  it("goes down to single years when zoomed in", () => {
    expect(computeTicks({ center: 1914, span: 6 }, 800).step).toBe(1);
  });
});

describe("which events show", () => {
  it("shows importance levels by zoom, plus highlighted and focused events", () => {
    expect(showsAtZoom(ev("a", 0, 1), 6000, noEmphasis)).toBe(true);
    expect(showsAtZoom(ev("b", 0, 2), 5000, noEmphasis)).toBe(false);
    expect(showsAtZoom(ev("b", 0, 2), 3000, noEmphasis)).toBe(true);
    expect(showsAtZoom(ev("c", 0, 3), 1000, noEmphasis)).toBe(false);
    expect(showsAtZoom(ev("c", 0, 3), 600, noEmphasis)).toBe(true);
    expect(showsAtZoom(ev("c", 0, 3), 6000, { highlighted: "c", focused: new Set() })).toBe(true);
    expect(showsAtZoom(ev("c", 0, 3), 6000, { highlighted: null, focused: new Set(["c"]) })).toBe(true);
  });
});

describe("layoutTrack", () => {
  it("packs overlapping pins into three lanes, then falls back to dots", () => {
    const events = [ev("a", 1900), ev("b", 1901), ev("c", 1902), ev("d", 1903)];
    const { pins } = layoutTrack(events, { center: 1900, span: 100 }, 800, noEmphasis, () => 100);
    expect(
      pins
        .filter((p) => p.lane >= 0)
        .map((p) => p.lane)
        .sort(),
    ).toEqual([0, 1, 2]);
    expect(pins.filter((p) => p.lane < 0)).toHaveLength(1);
  });

  it("draws one dot per spot however many events pile up there", () => {
    const events = Array.from({ length: 200 }, (_, i) => ev(`e${i}`, 1950, i === 150 ? 2 : 3));
    const { pins } = layoutTrack(events, { center: 1950, span: 100 }, 800, noEmphasis, () => 100);
    const dots = pins.filter((p) => p.lane < 0);
    expect(pins.filter((p) => p.lane >= 0).map((p) => p.event.slug)[0]).toBe("e150");
    expect(dots).toHaveLength(1);
  });

  it("gives highlighted events first pick of the lanes", () => {
    const events = [ev("a", 1900), ev("b", 1901), ev("c", 1902), ev("hl", 1903, 3)];
    const { pins } = layoutTrack(
      events,
      { center: 1900, span: 100 },
      800,
      { highlighted: "hl", focused: new Set() },
      () => 100,
    );
    expect(pins.find((p) => p.event.slug === "hl")?.lane).toBe(0);
  });

  it("draws ranges for multi-year events and skips far off-screen ones", () => {
    const events = [ev("war", 1914, 1, 1918), ev("far", 1000)];
    const { pins, ranges } = layoutTrack(events, { center: 1916, span: 40 }, 800, noEmphasis);
    expect(ranges.map((r) => r.event.slug)).toEqual(["war"]);
    expect(ranges[0].width).toBeCloseTo(80, 9);
    expect(pins.map((p) => p.event.slug)).toEqual(["war"]);
  });
});

describe("eventsAround and eraAt", () => {
  const events = [ev("a", 1869, 2), ev("b", 1899, 3), ev("ww1", 1914, 1, 1918), ev("x", 1500)];
  it("lists the closest events in view, inside spans first", () => {
    expect(eventsAround(events, { center: 1916, span: 100 }).map((e) => e.slug)).toEqual(["ww1", "b", "a"]);
  });
  it("finds the era for a year, with open-ended last era", () => {
    const eras = [
      { slug: "modern", startYear: 1789, endYear: 1945 },
      { slug: "contemporary", startYear: 1945, endYear: null },
    ];
    expect(eraAt(eras, 1944)?.slug).toBe("modern");
    expect(eraAt(eras, 1945)?.slug).toBe("contemporary");
    expect(eraAt(eras, 2026)?.slug).toBe("contemporary");
  });
});
