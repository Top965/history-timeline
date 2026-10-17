"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEvent, TimelineTile } from "@/lib/content/types";
import type { Locale } from "@/lib/i18n/config";
import type { View } from "@/lib/timeline/geometry";
import { tileKey, tilesForView } from "@/lib/timeline/tiles";

/** Wait for the view to settle a moment before asking for tiles, so a fling doesn't fetch every tile it passes. */
const SETTLE_MS = 150;

/**
 * Loads the smaller events for the stretch of time on screen, tile by tile,
 * and keeps every tile it has loaded (they are small and the visitor may come back).
 */
export function useTiles(
  locale: Locale,
  view: View,
  currentYear: number,
  initial: readonly TimelineTile[] = [],
): TimelineEvent[] {
  const [tiles, setTiles] = useState<ReadonlyMap<string, TimelineEvent[]>>(
    () => new Map(initial.map((t) => [tileKey(t.level, t.tile), t.events])),
  );
  const requested = useRef<Set<string> | null>(null);
  requested.current ??= new Set(initial.map((t) => tileKey(t.level, t.tile)));
  const wanted = tilesForView(view, currentYear);
  const wantedKey = wanted.map((t) => tileKey(t.level, t.tile)).join(",");

  useEffect(() => {
    const done = requested.current!;
    const missing = wantedKey.split(",").filter((k) => k && !done.has(k));
    if (!missing.length) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      for (const key of missing) {
        const [level, tile] = key.split(":");
        done.add(key);
        fetch(`/api/timeline?locale=${locale}&level=${level}&tile=${tile}`, { signal: controller.signal })
          .then((res) => {
            if (!res.ok) throw new Error(`timeline tile ${key}: ${res.status}`);
            return res.json() as Promise<TimelineTile>;
          })
          .then((data) => setTiles((prev) => new Map(prev).set(key, data.events)))
          .catch((err: unknown) => {
            // Let a later view try again.
            done.delete(key);
            if (!controller.signal.aborted) console.error(err);
          });
      }
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locale, wantedKey]);

  return useMemo(() => {
    const seen = new Map<string, TimelineEvent>();
    for (const events of tiles.values()) for (const e of events) seen.set(e.slug, e);
    return [...seen.values()];
  }, [tiles]);
}
