import "server-only";
import type { SearchData } from "@/lib/content/types";
import { getSearchData } from "@/lib/db/queries";
import type { Locale } from "@/lib/i18n/config";
import { logger } from "@/lib/log/logger";
import { buildSearchIndex, search, type SearchIndex, type SearchResult } from "./search";

/**
 * The search index lives in server memory, one per language. `getSearchData` is
 * cached for hours; the index is rebuilt only when that data changes, noticed by
 * object identity or, when the cache hands back a fresh copy, a fingerprint of
 * every name and keyword (a few milliseconds, far cheaper than rebuilding).
 */
const indexes = new Map<Locale, { data: SearchData; fingerprint: string; index: SearchIndex }>();

function fingerprintOf(d: SearchData): string {
  // FNV-1a over everything the index is built from.
  let h = 0x811c9dc5;
  const add = (s: string) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  };
  add(String(d.currentYear));
  for (const e of d.events) add(`${e.slug}|${e.title}|${e.place}|${e.importance}|${e.keywords.join(",")}`);
  for (const p of d.people) add(`${p.slug}|${p.name}|${p.description}|${p.keywords.join(",")}`);
  for (const t of d.topics) add(`${t.slug}|${t.name}|${t.keywords.join(",")}`);
  for (const e of d.eras) add(`${e.slug}|${e.name}`);
  return `${d.events.length}:${d.people.length}:${(h >>> 0).toString(16)}`;
}

async function indexFor(locale: Locale): Promise<SearchIndex> {
  const data = await getSearchData(locale);
  const cached = indexes.get(locale);
  if (cached && (cached.data === data || cached.fingerprint === fingerprintOf(data))) return cached.index;
  const started = performance.now();
  const index = buildSearchIndex(data);
  indexes.set(locale, { data, fingerprint: fingerprintOf(data), index });
  logger.info(
    {
      kind: "search_index",
      locale,
      entries: index.entries.length,
      durationMs: Math.round(performance.now() - started),
    },
    "search index built",
  );
  return index;
}

/** Results trimmed for the browser: keywords are only for matching. */
function slim(r: SearchResult): SearchResult {
  switch (r.type) {
    case "event":
      return { ...r, event: { ...r.event, keywords: [] } };
    case "person":
      return { ...r, person: { ...r.person, keywords: [] } };
    case "topic":
      return { ...r, topic: { ...r.topic, keywords: [], eventSlugs: [] } };
    case "era":
      return { ...r, era: { ...r.era, keywords: [] } };
    default:
      return r;
  }
}

export async function searchSite(locale: Locale, query: string, limit = 7): Promise<SearchResult[]> {
  return search(await indexFor(locale), query, limit).map(slim);
}
