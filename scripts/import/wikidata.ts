/**
 * Wikidata: SPARQL queries, batched entity lookups, and helpers that turn
 * claims (statements) into plain values.
 */
import { chunk, type Http } from "./http";

export const WDQS = "https://query.wikidata.org/sparql";
export const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

// ---------------------------------------------------------------------------
// Raw shapes (only the parts we read)
// ---------------------------------------------------------------------------

export type TimeValue = { time: string; precision: number; calendarmodel?: string };
type DataValue =
  | { type: "wikibase-entityid"; value: { id: string } }
  | { type: "time"; value: TimeValue }
  | { type: "string"; value: string }
  | { type: "monolingualtext"; value: { text: string; language: string } }
  | { type: "globecoordinate"; value: { latitude: number; longitude: number; globe?: string } }
  | { type: string; value: unknown };

type Snak = { snaktype: "value" | "somevalue" | "novalue"; property: string; datavalue?: DataValue };

export type Claim = {
  mainsnak: Snak;
  rank: "preferred" | "normal" | "deprecated";
  qualifiers?: Record<string, Snak[]>;
  references?: { snaks: Record<string, Snak[]> }[];
};

export type Entity = {
  id: string;
  missing?: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  aliases?: Record<string, { value: string }[]>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, { title: string }>;
};

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type WdDate = {
  /** Historical year: negative = BCE, never 0. */
  year: number;
  /** ISO date when Wikidata knows the exact day (CE only). */
  date: string | null;
  /** Coarser than a year (decade, century…). */
  approximate: boolean;
};

/**
 * "+1937-04-28T00:00:00Z" (precision 11 = day) → { year: 1937, date: "1937-04-28" }.
 * "-0044-03-15T00:00:00Z" → { year: -44, date: null }: Wikidata writes BCE years
 * with a minus sign and no year 0, which matches our historical years.
 */
export function parseTime(v: TimeValue | undefined | null): WdDate | null {
  if (!v) return null;
  const m = v.time.match(/^([+-])(\d+)-(\d{2})-(\d{2})T/);
  if (!m) return null;
  const year = Number(m[2]) * (m[1] === "-" ? -1 : 1);
  if (year === 0 || !Number.isFinite(year) || Math.abs(year) > 100000) return null;
  // Exact days only for real Gregorian dates: Julian-calendar dates and impossible days (April 31) keep just the year.
  const julian = v.calendarmodel?.endsWith("/Q1985786") ?? false;
  const iso = `${m[2].padStart(4, "0").slice(-4)}-${m[3]}-${m[4]}`;
  const real =
    !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso);
  const date = v.precision >= 11 && year > 0 && year < 10000 && !julian && real ? iso : null;
  return { year, date, approximate: v.precision < 9 };
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/** Statements for a property, best rank first, deprecated ones dropped. */
export function claims(e: Entity, prop: string): Claim[] {
  const all = (e.claims?.[prop] ?? []).filter((c) => c.rank !== "deprecated");
  const preferred = all.filter((c) => c.rank === "preferred");
  return preferred.length ? [...preferred, ...all.filter((c) => c.rank !== "preferred")] : all;
}

const valueOf = (s: Snak | undefined) => (s?.snaktype === "value" ? s.datavalue : undefined);

export function itemId(s: Snak | undefined): string | null {
  const v = valueOf(s);
  return v?.type === "wikibase-entityid" ? (v.value as { id: string }).id : null;
}

export function timeOf(s: Snak | undefined): WdDate | null {
  const v = valueOf(s);
  return v?.type === "time" ? parseTime(v.value as TimeValue) : null;
}

export function stringOf(s: Snak | undefined): string | null {
  const v = valueOf(s);
  return v?.type === "string" ? (v.value as string) : null;
}

/** Coordinates on Earth (Wikidata also records places on the Moon and Mars). */
export function coordinates(e: Entity): { latitude: number; longitude: number } | null {
  for (const c of claims(e, "P625")) {
    const v = valueOf(c.mainsnak);
    if (v?.type !== "globecoordinate") continue;
    const g = v.value as { latitude: number; longitude: number; globe?: string };
    if (g.globe && !g.globe.endsWith("/Q2")) continue;
    if (Math.abs(g.latitude) <= 90 && Math.abs(g.longitude) <= 180)
      return { latitude: Number(g.latitude.toFixed(6)), longitude: Number(g.longitude.toFixed(6)) };
  }
  return null;
}

export const firstItem = (e: Entity, prop: string) =>
  claims(e, prop)
    .map((c) => itemId(c.mainsnak))
    .find(Boolean) ?? null;
export const firstTime = (e: Entity, prop: string) =>
  claims(e, prop)
    .map((c) => timeOf(c.mainsnak))
    .find(Boolean) ?? null;
export const firstString = (e: Entity, prop: string) =>
  claims(e, prop)
    .map((c) => stringOf(c.mainsnak))
    .find(Boolean) ?? null;
export const items = (e: Entity, prop: string) => [
  ...new Set(
    claims(e, prop)
      .map((c) => itemId(c.mainsnak))
      .filter((x): x is string => x != null),
  ),
];

export const qualifierTime = (c: Claim, prop: string) => timeOf(c.qualifiers?.[prop]?.[0]);

export const label = (e: Entity | undefined, lang: string) => e?.labels?.[lang]?.value ?? null;
export const description = (e: Entity | undefined, lang: string) => e?.descriptions?.[lang]?.value ?? null;

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

type SparqlResponse = { results: { bindings: Record<string, { value: string } | undefined>[] } };

/** Runs a SPARQL query; returns rows of plain strings. Entity URIs are reduced to their Q-id. */
export async function sparql(
  http: Http,
  query: string,
  operation: string,
  endpoint: string = WDQS,
): Promise<Record<string, string>[]> {
  const res = await http.json<SparqlResponse>(endpoint, {
    service: "wikidata",
    operation,
    form: { query, format: "json" },
    accept: "application/sparql-results+json",
  });
  return res.results.bindings.map((b) =>
    Object.fromEntries(
      Object.entries(b).map(([k, v]) => [k, (v?.value ?? "").replace(/^http:\/\/www\.wikidata\.org\/entity\//, "")]),
    ),
  );
}

/** Fetches entities 50 at a time (in parallel, within the Http concurrency limit). Missing ids are left out. */
export async function getEntities(
  http: Http,
  ids: readonly string[],
  props: string[] = ["labels", "descriptions", "claims", "sitelinks"],
  languages: string[] = ["en", "ar"],
  /** Keep only these statements (saves memory on large runs). */
  keepClaims?: readonly string[],
): Promise<Map<string, Entity>> {
  const out = new Map<string, Entity>();
  const unique = [...new Set(ids)].filter((id) => /^Q[1-9]\d*$/.test(id)).sort();
  await Promise.all(
    chunk(unique, 50).map(async (batch) => {
      const url = new URL(WIKIDATA_API);
      url.search = new URLSearchParams({
        action: "wbgetentities",
        format: "json",
        ids: batch.join("|"),
        props: props.join("|"),
        languages: languages.join("|"),
        sitefilter: "enwiki|arwiki",
      }).toString();
      const res = await http.json<{ entities?: Record<string, Entity> }>(url.toString(), {
        service: "wikidata",
        operation: "wikidata.getentities",
      });
      for (const [id, e] of Object.entries(res.entities ?? {})) {
        if (e.missing) continue;
        if (keepClaims && e.claims)
          e.claims = Object.fromEntries(keepClaims.flatMap((p) => (e.claims![p] ? [[p, e.claims![p]]] : [])));
        out.set(id, e);
      }
    }),
  );
  return out;
}

export type SearchHit = { id: string; label: string | null; description: string | null };

/** Wikidata's own name search (labels and aliases, typo-tolerant prefix match) in one language. */
export async function searchEntities(http: Http, query: string, language: string, limit = 10): Promise<SearchHit[]> {
  const url = new URL(WIKIDATA_API);
  url.search = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    type: "item",
    search: query,
    language,
    uselang: language,
    limit: String(limit),
  }).toString();
  const res = await http.json<{ search?: { id: string; label?: string; description?: string }[] }>(url.toString(), {
    service: "wikidata",
    operation: "wikidata.searchentities",
  });
  return (res.search ?? []).map((h) => ({ id: h.id, label: h.label ?? null, description: h.description ?? null }));
}
