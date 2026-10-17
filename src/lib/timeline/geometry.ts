/**
 * Pure timeline math: the visible window, zooming, ticks, which events show at a
 * zoom level, and how pins are packed into lanes. Ported from the approved prototype.
 */

export type View = { center: number; span: number };

export const MIN_SPAN = 6; // years visible when fully zoomed in
export const MAX_SPAN = 6200; // years visible when fully zoomed out
export const MIN_YEAR = -3600;
/** Where the home timeline opens. */
export const INITIAL_VIEW: View = { center: 1880, span: 380 };

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function maxYear(currentYear: number): number {
  return currentYear + 9;
}

export function clampView(view: View, currentYear: number): View {
  return {
    span: clamp(view.span, MIN_SPAN, MAX_SPAN),
    center: clamp(view.center, MIN_YEAR, maxYear(currentYear)),
  };
}

export const yearToX = (year: number, view: View, width: number) =>
  ((year - view.center) / view.span) * width + width / 2;
export const xToYear = (x: number, view: View, width: number) => view.center + ((x - width / 2) / width) * view.span;

/** Zoom by `factor` (<1 zooms in) keeping the year under pixel `x` fixed. */
export function zoomAt(view: View, x: number, factor: number, width: number, currentYear: number): View {
  const anchor = xToYear(x, view, width);
  const span = clamp(view.span * factor, MIN_SPAN, MAX_SPAN);
  return clampView({ center: anchor - ((x - width / 2) / width) * span, span }, currentYear);
}

/** View that frames a range with a little air around it. */
export function fitRange(start: number, end: number, padding = 1.12, minSpan = MIN_SPAN): View {
  return { center: (start + end) / 2, span: Math.max(minSpan, (end - start) * padding) };
}

/** Interpolates between two views on a log scale for the span, so zooms feel even. */
export function interpolateView(from: View, to: View, t: number): View {
  return {
    center: from.center + (to.center - from.center) * t,
    span: Math.exp(Math.log(from.span) + (Math.log(to.span) - Math.log(from.span)) * t),
  };
}

export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// ---------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------

const TICK_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
const MIN_MAJOR_PX = 84;
const MIN_MINOR_PX = 8;

export type Ticks = { step: number; major: number[]; minor: number[] };

export function computeTicks(view: View, width: number): Ticks {
  const step = TICK_STEPS.find((s) => (s / view.span) * width >= MIN_MAJOR_PX) ?? 2000;
  const minorStep = step >= 10 ? step / 5 : step === 5 ? 1 : 0;
  const lo = view.center - view.span / 2;
  const hi = view.center + view.span / 2;
  const major: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) major.push(t);
  const minor: number[] = [];
  if (minorStep && (minorStep / view.span) * width >= MIN_MINOR_PX) {
    for (let t = Math.ceil(lo / minorStep) * minorStep; t <= hi; t += minorStep) {
      if (t % step !== 0) minor.push(t);
    }
  }
  return { step, major, minor };
}

// ---------------------------------------------------------------------------
// Events on the track
// ---------------------------------------------------------------------------

export type TrackEvent = {
  slug: string;
  title: string;
  startYear: number;
  endYear: number | null;
  importance: 1 | 2 | 3;
};

export type Emphasis = { highlighted: string | null; focused: ReadonlySet<string> };

/** Importance 1 always shows; 2 below 4,000 years on screen; 3 below 700. Highlights always show. */
export function showsAtZoom(e: TrackEvent, span: number, emphasis: Emphasis): boolean {
  return (
    e.importance === 1 ||
    (e.importance === 2 && span < 4000) ||
    (e.importance === 3 && span < 700) ||
    e.slug === emphasis.highlighted ||
    emphasis.focused.has(e.slug)
  );
}

export const LANE_TOPS = [34, 74, 114] as const;
export const AXIS_TOP = 178;
const PIN_OFFSET = 12;
const PIN_GAP = 6;

export type PlacedPin<E extends TrackEvent> =
  { event: E; x: number; lane: number; left: number; right: number } | { event: E; x: number; lane: -1 };

/** Rough pin width in px from its label; good enough for lane packing. */
export const estimatePinWidth = (title: string) => title.length * 6.9 + 30;

/**
 * Picks visible events and packs them into three lanes. Events that do not fit
 * become dots on the axis. Highlighted and focused events get first pick of lanes.
 */
export function layoutTrack<E extends TrackEvent>(
  events: readonly E[],
  view: View,
  width: number,
  emphasis: Emphasis,
  measure: (e: E) => number = (e) => estimatePinWidth(e.title),
): { pins: PlacedPin<E>[]; ranges: { event: E; left: number; width: number }[] } {
  const visible = events
    .filter((e) => showsAtZoom(e, view.span, emphasis))
    .filter(
      (e) => yearToX(e.endYear ?? e.startYear, view, width) > -260 && yearToX(e.startYear, view, width) < width + 20,
    );

  const ranges = visible
    .filter((e) => e.endYear != null && e.endYear !== e.startYear)
    .sort((a, b) => a.startYear - b.startYear)
    .map((e) => {
      const left = yearToX(e.startYear, view, width);
      return { event: e, left, width: Math.max(3, yearToX(e.endYear!, view, width) - left) };
    });

  const rank = (e: E) => (e.slug === emphasis.highlighted ? -2 : emphasis.focused.has(e.slug) ? -1 : e.importance);
  const ordered = [...visible].sort((a, b) => rank(a) - rank(b) || a.startYear - b.startYear);

  const pins: PlacedPin<E>[] = [];
  const taken: { lane: number; left: number; right: number }[] = [];
  for (const e of ordered) {
    const x = yearToX(e.startYear, view, width);
    const left = x - PIN_OFFSET;
    const right = left + measure(e);
    let lane = -1;
    for (let i = 0; i < LANE_TOPS.length; i++) {
      if (!taken.some((p) => p.lane === i && left < p.right + PIN_GAP && right > p.left - PIN_GAP)) {
        lane = i;
        break;
      }
    }
    if (lane < 0) {
      pins.push({ event: e, x, lane: -1 });
    } else {
      taken.push({ lane, left, right });
      pins.push({ event: e, x, lane, left, right });
    }
  }
  return { pins, ranges };
}

/** Up to `limit` events closest to the playhead within the visible window. */
export function eventsAround<E extends TrackEvent>(events: readonly E[], view: View, limit = 6): E[] {
  const year = Math.round(view.center);
  const lo = view.center - view.span / 2;
  const hi = view.center + view.span / 2;
  return events
    .filter((e) => (e.endYear ?? e.startYear) >= lo && e.startYear <= hi)
    .map((e) => {
      const end = e.endYear ?? e.startYear;
      const distance =
        year >= e.startYear && year <= end ? 0 : Math.min(Math.abs(e.startYear - year), Math.abs(end - year));
      return { e, distance };
    })
    .sort((a, b) => a.distance - b.distance || a.e.importance - b.e.importance)
    .slice(0, limit)
    .map((x) => x.e);
}

export function eraAt<T extends { startYear: number; endYear: number | null }>(
  eras: readonly T[],
  year: number,
): T | undefined {
  return eras.find((e) => year >= e.startYear && (e.endYear == null || year < e.endYear)) ?? eras[eras.length - 1];
}

/** View to show a single event: centered on it, with its duration given room. */
export function viewForEvent(e: { startYear: number; endYear: number | null }): View {
  const len = (e.endYear ?? e.startYear) - e.startYear;
  return { center: e.startYear + len / 2, span: Math.max(40, len * 2.5) };
}

/** View to show a topic's range. */
export function viewForRange(start: number, end: number): View {
  return fitRange(start, end, 1.15, 30);
}
