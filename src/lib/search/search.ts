import type { Era, TimelineData, TimelineEvent, Topic } from "@/lib/content/types";
import { STOP_WORDS, toAsciiDigits, wordScore, words } from "./text";
import { MIN_YEAR } from "@/lib/timeline/geometry";

/**
 * Keyword search with typo tolerance over years, eras, topics and events.
 * Runs in the browser over data the page already has. Step 4 replaces the
 * scoring with meaning-based search behind the same `search()` signature.
 */

export type SearchResult =
  | { type: "year"; year: number; score: number }
  | { type: "era"; era: Era; score: number }
  | { type: "topic"; topic: Topic; score: number }
  | { type: "event"; event: TimelineEvent; score: number };

type Entry =
  | { type: "era"; ref: Era; boost: number; words: Set<string>; title: null }
  | { type: "topic"; ref: Topic; boost: number; words: Set<string>; title: null }
  | { type: "event"; ref: TimelineEvent; boost: number; words: Set<string>; title: Set<string> };

export type SearchIndex = { entries: Entry[]; currentYear: number };

const bag = (...parts: (string | string[])[]) => new Set(words(parts.flat().join(" ")));

export function buildSearchIndex(data: TimelineData): SearchIndex {
  const entries: Entry[] = [
    ...data.topics.map((t): Entry => ({
      type: "topic",
      ref: t,
      boost: 3,
      words: bag(t.name, t.keywords),
      title: null,
    })),
    ...data.eras.map((e): Entry => ({ type: "era", ref: e, boost: 0.5, words: bag(e.name, e.keywords), title: null })),
    ...data.events.map((e): Entry => ({
      type: "event",
      ref: e,
      boost: 0,
      words: bag(e.title, e.place, e.keywords),
      title: bag(e.title),
    })),
  ];
  return { entries, currentYear: data.currentYear };
}

/**
 * "44 BC", "44 bce", "-44", "1066", "AD 800", "800 ce", "44 ق.م", "١٩٦٩".
 * Returns a historical year (negative = BCE) or null.
 */
export function parseYear(raw: string): number | null {
  const s = toAsciiDigits(raw.trim().toLowerCase()).replace(/\s+/g, " ");
  const m =
    s.match(
      /^(-?\d{1,4})\s*(bc|bce|b\.c\.?|b\.c\.e\.?|ad|a\.d\.?|ce|c\.e\.?|ق\.? ?م\.?|م\.?|قبل الميلاد|ميلادي|ميلاديه|ميلادية)?$/,
    ) ?? s.match(/^(?:ad|a\.d\.?)\s*(\d{1,4})$/);
  if (!m) return null;
  let year = Number.parseInt(m[1], 10);
  const era = m[2] ?? "";
  if (/^(b|ق)/.test(era) && year > 0) year = -year;
  if (year === 0) return null;
  return year;
}

export function search(index: SearchIndex, query: string, limit = 7): SearchResult[] {
  const raw = query.trim();
  if (!raw) return [];
  const out: SearchResult[] = [];

  const year = parseYear(raw);
  if (year != null && year >= MIN_YEAR && year <= index.currentYear) {
    out.push({ type: "year", year, score: 99 });
  }

  const terms = words(raw).filter((w) => !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  if (!terms.length) return out;
  const needed = Math.max(1, Math.ceil(terms.length / 2));

  for (const entry of index.entries) {
    let sum = 0;
    let hits = 0;
    let titleHits = 0;
    for (const q of terms) {
      let best = 0;
      for (const w of entry.words) {
        const s = wordScore(q, w);
        if (s > best) best = s;
        if (best === 3) break;
      }
      if (best) {
        sum += best;
        hits++;
        if (entry.title?.has(q)) titleHits++;
      }
    }
    if (hits < needed) continue;
    const score =
      sum +
      hits * 2 +
      (hits === terms.length ? 6 : 0) +
      entry.boost +
      titleHits +
      (entry.type === "event" ? (3 - entry.ref.importance) * 0.2 : 0);
    if (entry.type === "topic") out.push({ type: "topic", topic: entry.ref, score });
    else if (entry.type === "era") out.push({ type: "era", era: entry.ref, score });
    else out.push({ type: "event", event: entry.ref, score });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
