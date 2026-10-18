"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Era, TimelineEvent } from "@/lib/content/types";
import type { Locale } from "@/lib/i18n/config";
import { jumpToSection } from "@/lib/wiki/jump";
import { clampView, viewForRange, zoomAt, type View } from "@/lib/timeline/geometry";
import { Track } from "./Track";

type Props = {
  locale: Locale;
  eras: Era[];
  currentYear: number;
  /** The topic's or person's range. */
  startYear: number;
  endYear: number | null;
  /** Events that belong to the topic or person, at full strength. A slug with a colon is shown but not linked. */
  events: TimelineEvent[];
  /** World events for context, drawn faintly. */
  context: TimelineEvent[];
  /** Tapping one of `events` first opens the part of the page's article that tells it, when there is one. */
  jumpToSections?: boolean;
};

/** The timeline instrument, opened on one topic or lifetime with everything else faint. */
export function FocusTimeline({
  locale,
  eras,
  currentYear,
  startYear,
  endYear,
  events,
  context,
  jumpToSections,
}: Props) {
  const router = useRouter();
  const [view, setViewState] = useState<View>(() =>
    clampView(viewForRange(startYear, endYear ?? currentYear), currentYear),
  );
  const viewRef = useRef(view);
  const setView = useCallback(
    (v: View) => {
      const next = clampView(v, currentYear);
      viewRef.current = next;
      setViewState(next);
    },
    [currentYear],
  );

  const focus = useMemo(
    () => ({ startYear, endYear, eventSlugs: events.map((e) => e.slug) }),
    [startYear, endYear, events],
  );
  const { all, muted } = useMemo(() => {
    const own = new Set(events.map((e) => e.slug));
    const extra = context.filter((e) => !own.has(e.slug));
    return { all: [...events, ...extra], muted: new Set(extra.map((e) => e.slug)) };
  }, [events, context]);

  return (
    <Track
      locale={locale}
      view={view}
      eras={eras}
      events={all}
      currentYear={currentYear}
      focus={focus}
      muted={muted}
      highlighted={null}
      onInteractStart={() => {}}
      onPan={(center) => setView({ center, span: viewRef.current.span })}
      onZoomAt={(x, factor, w) => setView(zoomAt(viewRef.current, x, factor, w, currentYear))}
      onPinch={(anchor, x, span, w) => setView({ center: anchor - ((x - w / 2) / w) * span, span })}
      onZoomButton={(factor) => setView({ center: viewRef.current.center, span: viewRef.current.span * factor })}
      onOpen={(slug) => {
        const own = events.find((e) => e.slug === slug);
        const titles = events.map((e) => e.title);
        if (jumpToSections && own && jumpToSection(own.title, titles)) return;
        // Pins whose slug has a colon are not event pages (for example a person's term in office).
        if (!slug.includes(":")) router.push(`/${locale}/events/${slug}`);
      }}
    />
  );
}
