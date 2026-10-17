"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineData, Topic } from "@/lib/content/types";
import { formatEventYears, formatRange, formatYear, formatYearShort } from "@/lib/format/years";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import type { SearchResult } from "@/lib/search/search";
import {
  clampView,
  easeInOutCubic,
  eraAt,
  eventsAround,
  fitRange,
  interpolateView,
  viewForEvent,
  viewForRange,
  zoomAt,
  type View,
} from "@/lib/timeline/geometry";
import { Toolbar } from "@/components/ui/Toolbar";
import { parseTimelineHash, requestTimelineJump, subscribeTimelineJump } from "./jump";
import { SearchBox } from "./SearchBox";
import { Track } from "./Track";

const INITIAL_VIEW: View = { center: 1880, span: 380 };
const FLY_MS = 700;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Explorer({ locale, data }: { locale: Locale; data: TimelineData }) {
  const t = getMessages(locale);
  const router = useRouter();
  const { currentYear } = data;
  const [view, setViewState] = useState<View>(INITIAL_VIEW);
  const [focus, setFocus] = useState<Topic | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const viewRef = useRef(view);
  const animRef = useRef(0);
  const instrumentRef = useRef<HTMLDivElement>(null);

  const setView = useCallback(
    (v: View) => {
      const next = clampView(v, currentYear);
      viewRef.current = next;
      setViewState(next);
    },
    [currentYear],
  );

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    animRef.current = 0;
  }, []);

  const flyTo = useCallback(
    (target: View) => {
      stopAnimation();
      if (prefersReducedMotion()) {
        setView(target);
        return;
      }
      const from = viewRef.current;
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / FLY_MS);
        setView(interpolateView(from, target, easeInOutCubic(k)));
        animRef.current = k < 1 ? requestAnimationFrame(step) : 0;
      };
      animRef.current = requestAnimationFrame(step);
    },
    [setView, stopAnimation],
  );

  // Deep links (#year=1914&span=30) and "Show on timeline" requests from story pages.
  useEffect(() => {
    // Subscribe first so an animated request from a story page wins over the hash it also set.
    const unsubscribe = subscribeTimelineJump(({ instant, ...v }) => {
      setFocus(null);
      setHighlighted(null);
      if (instant) setView(v);
      else flyTo(v);
    });
    const fromHash = parseTimelineHash(window.location.hash);
    if (fromHash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      if (animRef.current === 0) requestTimelineJump({ ...fromHash, instant: true });
    }
    return () => {
      unsubscribe();
      stopAnimation();
    };
  }, [flyTo, setView, stopAnimation]);

  const year = Math.round(view.center);
  const era = eraAt(data.eras, year);
  const bySlug = useMemo(() => new Map(data.events.map((e) => [e.slug, e])), [data.events]);
  const around = focus
    ? focus.eventSlugs
        .map((s) => bySlug.get(s))
        .filter((e) => e != null)
        .sort((a, b) => a.startYear - b.startYear)
    : eventsAround(data.events, view);

  const openEvent = (slug: string) => router.push(`/${locale}/events/${slug}`);

  function choose(r: SearchResult) {
    setHighlighted(null);
    if (r.type === "year") {
      setFocus(null);
      flyTo({ center: r.year, span: 40 });
    } else if (r.type === "era") {
      setFocus(null);
      const end = r.era.endYear ?? currentYear;
      flyTo(fitRange(r.era.startYear, Math.min(end, currentYear)));
    } else if (r.type === "topic") {
      setFocus(r.topic);
      flyTo(viewForRange(r.topic.startYear, r.topic.endYear ?? currentYear));
    } else {
      setFocus(null);
      setHighlighted(r.event.slug);
      flyTo(viewForEvent(r.event));
    }
    instrumentRef.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  return (
    <div className="gutter mx-auto grid max-w-[1080px] gap-[18px] pt-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="font-display text-[22px] font-bold tracking-[.01em]">
            <h1 className="inline">{t.brand}</h1>{" "}
            <span className="font-sans text-base font-semibold text-accent" lang={locale === "ar" ? "en" : "ar"}>
              {t.brandAlt}
            </span>
          </div>
          <p className="m-0 text-[13px] text-muted">{t.tagline}</p>
        </div>
        <div className="flex min-w-0 flex-[1_1_320px] flex-wrap items-center justify-end gap-2">
          <SearchBox locale={locale} data={data} onChoose={choose} />
          <Toolbar locale={locale} alternateHref={`/${locale === "ar" ? "en" : "ar"}`} />
        </div>
      </header>

      <div className="flex flex-wrap items-baseline gap-3.5">
        <div
          className="font-mono text-[clamp(40px,10vw,64px)] leading-none font-medium tracking-[-.02em] tabular-nums"
          data-testid="year-readout"
        >
          {formatYear(year, locale)}
        </div>
        <div className="font-display text-xl text-accent" aria-live="polite">
          {era ? t.readout.era(era.name) : ""}
        </div>
        <p className="m-0 w-full text-[13px] text-muted">{t.readout.hint}</p>
      </div>

      <nav className="no-scrollbar flex gap-2 overflow-x-auto pb-1" aria-label={t.eras.label}>
        {data.eras.map((e) => {
          const pressed = era?.slug === e.slug;
          const end = e.endYear == null || e.endYear > currentYear ? null : e.endYear;
          return (
            <button
              key={e.slug}
              type="button"
              aria-pressed={pressed}
              className={`chip ${pressed ? "border-ink bg-ink text-bg" : ""}`}
              onClick={() => {
                setFocus(null);
                setHighlighted(null);
                flyTo(fitRange(e.startYear, Math.min(e.endYear ?? currentYear, currentYear)));
              }}
            >
              {e.name}
              <span className={`chip-range ${pressed ? "text-inherit opacity-70" : ""}`}>
                {formatYearShort(e.startYear, locale)}–{end == null ? t.eras.now : formatYearShort(end, locale)}
              </span>
            </button>
          );
        })}
      </nav>

      {focus && (
        <section
          className="grid grid-cols-[1fr_auto] items-start gap-x-3.5 gap-y-1 rounded-xl border border-accent bg-accent-soft px-4 py-3.5"
          aria-labelledby="focus-title"
          data-testid="focus-card"
        >
          <div className="text-[11px] font-semibold tracking-[.08em] text-accent-strong uppercase">
            {t.focus.kicker}
          </div>
          <button
            type="button"
            className="btn col-start-2 row-span-2 row-start-1"
            onClick={() => {
              setFocus(null);
              setHighlighted(null);
            }}
          >
            {t.focus.clear}
          </button>
          <h2 id="focus-title" className="col-start-1 m-0 font-display text-2xl leading-tight">
            {focus.name}
            <small className="ms-2 font-mono text-[13px] font-normal text-muted">{formatRange(focus, locale)}</small>
          </h2>
          <p className="col-span-2 m-0 mt-0.5 max-w-[65ch] text-sm" lang={focus.summaryLocale} dir="auto">
            {focus.summary}
          </p>
        </section>
      )}

      <div ref={instrumentRef}>
        <Track
          locale={locale}
          view={view}
          eras={data.eras}
          events={data.events}
          currentYear={currentYear}
          focus={focus}
          highlighted={highlighted}
          onInteractStart={stopAnimation}
          onPan={(center) => setView({ center, span: viewRef.current.span })}
          onZoomAt={(x, factor, w) => setView(zoomAt(viewRef.current, x, factor, w, currentYear))}
          onPinch={(anchor, x, span, w) => setView({ center: anchor - ((x - w / 2) / w) * span, span })}
          onZoomButton={(factor) => flyTo({ center: viewRef.current.center, span: viewRef.current.span * factor })}
          onOpen={openEvent}
        />
      </div>

      <section aria-labelledby="around-heading">
        <h2 id="around-heading" className="m-0 mb-2.5 font-display text-[22px] font-medium">
          {focus ? (
            <>
              {t.around.inside} <span className="font-display">{focus.name}</span>
            </>
          ) : (
            <>
              {t.around.heading} <span className="font-mono text-lg">{formatYear(year, locale)}</span>
            </>
          )}
        </h2>
        {around.length ? (
          <ul
            className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5 p-0"
            data-testid="around-list"
          >
            {around.map((e) => (
              <li key={e.slug} className="min-w-0">
                <Link
                  href={`/${locale}/events/${e.slug}`}
                  className="grid h-full min-w-0 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-start text-ink no-underline hover:border-accent"
                >
                  <span className="min-w-[68px] font-mono text-xs text-muted tabular-nums">
                    {formatEventYears(e, locale)}
                  </span>
                  <span className="min-w-0 font-semibold" lang={e.textLocale} dir="auto">
                    {e.title}
                    {e.hasFullStory && (
                      <span
                        lang={locale}
                        className="ms-2 rounded border border-accent px-[5px] py-px align-[2px] text-[10px] font-semibold tracking-[.06em] text-accent uppercase"
                      >
                        {t.around.fullStory}
                      </span>
                    )}
                    <span className="block text-[13px] font-normal text-muted">{e.place}</span>
                  </span>
                  <span className="text-lg text-accent rtl:-scale-x-100" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t.around.empty}</p>
        )}
      </section>

      <footer className="note">{t.footer.credits}</footer>
    </div>
  );
}
