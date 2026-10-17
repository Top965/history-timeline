"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Era, TimelineEvent } from "@/lib/content/types";
import { formatEventYears, formatYear } from "@/lib/format/years";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { AXIS_TOP, computeTicks, LANE_TOPS, layoutTrack, xToYear, yearToX, type View } from "@/lib/timeline/geometry";

type Props = {
  locale: Locale;
  view: View;
  eras: Era[];
  events: TimelineEvent[];
  currentYear: number;
  /** A topic or a lifetime: its range is banded and its events get first pick of lanes. */
  focus: { startYear: number; endYear: number | null; eventSlugs: string[] } | null;
  /** Context events drawn faintly behind the focus (world events on a person's or topic's timeline). */
  muted?: ReadonlySet<string>;
  highlighted: string | null;
  onPan: (center: number) => void;
  onZoomAt: (x: number, factor: number, width: number) => void;
  onPinch: (anchorYear: number, x: number, span: number, width: number) => void;
  onZoomButton: (factor: number) => void;
  onOpen: (slug: string) => void;
  onInteractStart: () => void;
};

const FALLBACK_WIDTH = 800;
const pct = (x: number, width: number) => `${(x / width) * 100}%`;

/**
 * The instrument: era bands, axis, ticks, ranges, pins and the fixed center playhead.
 * Positions are percentages so the server render already lines up at any width;
 * the measured width is only used to pack labels and pick tick spacing.
 */
export function Track(props: Props) {
  const { locale, view, eras, events, currentYear, focus, highlighted, muted } = props;
  const t = getMessages(locale).timeline;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  // Latest props and width for the long-lived event listeners below.
  const handlers = useRef(props);
  const widthRef = useRef(width);
  useLayoutEffect(() => {
    handlers.current = props;
    widthRef.current = width;
  });
  const movedRef = useRef(false);

  // Measure.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width) || FALLBACK_WIDTH;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drag, pinch and wheel. Window listeners (not pointer capture) so clicks still reach pins.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pointers = new Map<number, number>();
    let drag: { x: number; center: number } | null = null;
    let pinch: { distance: number; span: number; year: number } | null = null;
    const localX = (e: PointerEvent | WheelEvent) => e.clientX - el.getBoundingClientRect().left;
    const viewNow = () => handlers.current.view;

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      handlers.current.onInteractStart();
      pointers.set(e.pointerId, localX(e));
      movedRef.current = false;
      if (pointers.size === 1) {
        drag = { x: localX(e), center: viewNow().center };
        el.dataset.dragging = "true";
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = {
          distance: Math.abs(a - b) || 1,
          span: viewNow().span,
          year: xToYear((a + b) / 2, viewNow(), widthRef.current),
        };
      }
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, localX(e));
      const w = widthRef.current;
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        movedRef.current = true;
        handlers.current.onPinch(pinch.year, (a + b) / 2, (pinch.span * pinch.distance) / (Math.abs(a - b) || 1), w);
      } else if (drag) {
        const dx = localX(e) - drag.x;
        if (Math.abs(dx) > 4) movedRef.current = true;
        if (movedRef.current) handlers.current.onPan(drag.center - (dx / w) * viewNow().span);
      }
    };
    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      pinch = null;
      if (pointers.size === 1) {
        drag = { x: [...pointers.values()][0], center: viewNow().center };
      } else {
        drag = null;
        delete el.dataset.dragging;
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      handlers.current.onInteractStart();
      const w = widthRef.current;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY))
        handlers.current.onPan(viewNow().center + (e.deltaX / w) * viewNow().span);
      else handlers.current.onZoomAt(localX(e), Math.exp(e.deltaY * 0.0018), w);
    };
    const key = (e: KeyboardEvent) => {
      const v = viewNow();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        handlers.current.onInteractStart();
        handlers.current.onPan(v.center + (e.key === "ArrowLeft" ? -0.1 : 0.1) * v.span);
      } else if (e.key === "+" || e.key === "=") {
        handlers.current.onInteractStart();
        handlers.current.onZoomAt(widthRef.current / 2, 0.7, widthRef.current);
      } else if (e.key === "-") {
        handlers.current.onInteractStart();
        handlers.current.onZoomAt(widthRef.current / 2, 1 / 0.7, widthRef.current);
      }
    };

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("keydown", key);
    };
  }, []);

  const focused = useMemo(() => new Set(focus?.eventSlugs ?? []), [focus]);
  const { pins, ranges } = layoutTrack(events, view, width, { highlighted, focused });
  const ticks = computeTicks(view, width);
  const X = (y: number) => yearToX(y, view, width);

  const todayX = X(currentYear);
  const focusBand = focus
    ? { left: Math.max(0, X(focus.startYear)), right: Math.min(width, X(focus.endYear ?? currentYear)) }
    : null;
  const shownSpan = Math.max(1, Math.round(view.span));

  return (
    <div dir="ltr" className="relative overflow-hidden rounded-[14px] border border-line bg-track">
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-roledescription="timeline"
        aria-label={t.label}
        data-testid="timeline"
        data-center={Math.round(view.center)}
        data-span={Math.round(view.span)}
        className="relative h-[236px] cursor-grab touch-none select-none data-[dragging=true]:cursor-grabbing"
        onClickCapture={(e) => {
          // A drag that ends on a pin is not a click.
          if (movedRef.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        {eras.map((era) => {
          const x1 = Math.max(0, X(era.startYear));
          const x2 = Math.min(width, X(era.endYear ?? currentYear + 9));
          if (x2 <= x1) return null;
          return (
            <div
              key={era.slug}
              className="absolute top-0 flex h-6 items-center overflow-hidden border-e border-bg px-2 text-[11px] font-semibold tracking-[.06em] whitespace-nowrap text-ink uppercase"
              style={{ left: pct(x1, width), width: pct(x2 - x1, width), background: `var(${era.colorToken})` }}
              aria-hidden="true"
            >
              {x2 - x1 > 70 ? era.name : ""}
            </div>
          );
        })}

        {ticks.minor.map((y) => (
          <div
            key={`m${y}`}
            className="absolute h-1 w-px bg-muted opacity-60"
            style={{ left: pct(X(y), width), top: AXIS_TOP }}
            aria-hidden="true"
          />
        ))}
        {ticks.major.map((y) => (
          <div key={`M${y}`} aria-hidden="true">
            <div className="absolute h-2 w-px bg-muted" style={{ left: pct(X(y), width), top: AXIS_TOP }} />
            <div
              className="absolute -translate-x-1/2 font-mono text-[11px] whitespace-nowrap text-muted tabular-nums"
              style={{ left: pct(X(y), width), top: AXIS_TOP + 12 }}
            >
              {formatYear(y, locale)}
            </div>
          </div>
        ))}

        {todayX >= 0 && todayX <= width && (
          <div
            className="pointer-events-none absolute top-6 bottom-[58px] w-0 border-s border-dashed border-muted"
            style={{ left: pct(todayX, width) }}
            aria-hidden="true"
          >
            <span className="absolute top-0.5 left-1 font-mono text-[10px] text-muted">{t.today}</span>
          </div>
        )}

        {ranges.map((r) => (
          <div
            key={`r${r.event.slug}`}
            className={`absolute h-[5px] rounded-[3px] ${muted?.has(r.event.slug) ? "bg-muted opacity-30" : "bg-accent opacity-55"}`}
            style={{ left: pct(r.left, width), width: pct(r.width, width), top: AXIS_TOP - 6 }}
            aria-hidden="true"
          />
        ))}

        {focusBand && focusBand.right > focusBand.left && (
          <div
            className="pointer-events-none absolute top-6 h-[154px] border-x-2 border-accent bg-accent/10"
            style={{ left: pct(focusBand.left, width), width: pct(focusBand.right - focusBand.left, width) }}
            aria-hidden="true"
          />
        )}

        {pins.map((p) => {
          const e = p.event;
          const label = `${e.title}, ${formatEventYears(e, locale)}`;
          if (p.lane < 0) {
            return (
              <button
                key={e.slug}
                type="button"
                className={`absolute -ms-[4.5px] size-[9px] rounded-full border-2 border-track p-0 ${muted?.has(e.slug) ? "bg-muted opacity-60" : "bg-accent"}`}
                style={{ left: pct(p.x, width), top: AXIS_TOP - 4 }}
                aria-label={label}
                title={e.title}
                onClick={() => props.onOpen(e.slug)}
              />
            );
          }
          const top = LANE_TOPS[p.lane];
          const isHl = e.slug === highlighted;
          const isMuted = !isHl && !!muted?.has(e.slug);
          return (
            <button
              key={e.slug}
              type="button"
              lang={e.textLocale}
              dir="auto"
              className={[
                "absolute flex h-[30px] -translate-x-3 items-center gap-1.5 rounded-lg border ps-2 pe-2.5 text-xs font-medium whitespace-nowrap",
                isHl
                  ? "pin-pulse border-accent bg-accent text-accent-ink"
                  : isMuted
                    ? "border-dashed border-line bg-track text-muted hover:bg-surface"
                    : e.importance === 1
                      ? "border-accent bg-surface font-semibold hover:bg-accent-soft"
                      : "border-line bg-surface hover:bg-accent-soft",
              ].join(" ")}
              style={{ left: pct(p.x, width), top }}
              aria-label={label}
              onClick={() => props.onOpen(e.slug)}
            >
              <span
                className={`size-2 flex-none rounded-full ${isHl ? "bg-accent-ink" : isMuted ? "bg-muted" : "bg-accent"}`}
                aria-hidden="true"
              />
              {e.title}
              <span
                className="pointer-events-none absolute top-[30px] left-[11px] w-px bg-accent opacity-60"
                style={{ height: AXIS_TOP - top - 30 }}
                aria-hidden="true"
              />
            </button>
          );
        })}

        <div className="absolute inset-x-0 h-px bg-ink opacity-50" style={{ top: AXIS_TOP }} aria-hidden="true" />
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-[3] -ml-px w-0.5 bg-ink" aria-hidden="true">
        <div className="absolute top-6 -left-1.5 border-[7px] border-transparent border-t-ink" />
      </div>
      <div
        className="absolute bottom-3 left-2.5 z-[4] font-mono text-[11px] text-muted"
        aria-live="off"
        data-testid="scale"
      >
        {t.showingYears(shownSpan)}
      </div>
      <div className="absolute right-2 bottom-2 z-[4] flex gap-1.5">
        <button
          type="button"
          className="size-[34px] rounded-lg border border-line bg-surface text-lg leading-none"
          aria-label={t.zoomOut}
          onClick={() => props.onZoomButton(2)}
        >
          −
        </button>
        <button
          type="button"
          className="size-[34px] rounded-lg border border-line bg-surface text-lg leading-none"
          aria-label={t.zoomIn}
          onClick={() => props.onZoomButton(0.5)}
        >
          +
        </button>
      </div>
    </div>
  );
}
