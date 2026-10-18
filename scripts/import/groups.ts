/**
 * Countries (today's and former), people groups and religions. Each becomes a
 * topic of its own kind, with the events and people Wikidata links to it. Every
 * link records the statement it came from, shown on the page as its source.
 * Everything here is pure (no network), so it is tested on saved samples.
 */
import { cleanTitle, entityKeywords, entitySpan, slugify, type BuildContext } from "./build";
import type { ImportEvent, ImportTopic } from "./model";
import { claims, description, itemId, label, type Claim, type Entity } from "./wikidata";
import { summarize } from "./wikipedia";

export type GroupKind = "country" | "former_country" | "people" | "religion";
type Hint = "country" | "people" | "religion";

/** One event or person in one group, and the Wikidata statement that says so. */
export type GroupLink = { group: string; hint: Hint; member: string; type: "event" | "person"; via: string };

/** Pages need this many events and people, except today's countries, which always get one. */
export const MIN_GROUP_MEMBERS = 10;
/** People listed on a group page, most covered first. */
export const MAX_GROUP_PEOPLE = 200;

/** Kinds of item that are a country today. */
const COUNTRY_CLASSES = new Set([
  "Q6256", // country
  "Q3624078", // sovereign state
  "Q15634554", // state with limited recognition
  "Q1763527", // constituent country
  "Q7275", // state
]);

/** Kinds of item that are a state of the past. */
const FORMER_CLASSES = new Set([
  "Q3024240", // historical country
  "Q48349", // empire
  "Q28171280", // ancient civilization
  "Q19953632", // former administrative territorial entity
  "Q1250464", // realm
]);

/**
 * Reference parts that don't make a statement sourced: "imported from Wikipedia",
 * its URL, "based on heuristic", "inferred from", and the date it was looked up.
 */
const WEAK_REFERENCE = new Set(["P143", "P4656", "P887", "P3452", "P813"]);

/** Does a statement cite a real source? */
export const isSourced = (c: Claim) =>
  (c.references ?? []).some((r) => Object.keys(r.snaks ?? {}).some((p) => !WEAK_REFERENCE.has(p)));

const ended = (c: Claim) => !!c.qualifiers?.P582?.length;

/** The country a place is in today: its own "country" statement without an end date, best rank first. */
export function currentCountry(place: Entity): string | null {
  const current = claims(place, "P17").filter((c) => !ended(c));
  return current.map((c) => itemId(c.mainsnak)).find(Boolean) ?? null;
}

const values = (e: Entity, prop: string, keep: (c: Claim) => boolean = () => true) => [
  ...new Set(
    claims(e, prop)
      .filter(keep)
      .map((c) => itemId(c.mainsnak))
      .filter((x): x is string => !!x),
  ),
];

/**
 * Which events and people belong to which country, people group and religion.
 *
 * - Events: their country (P17), the country their location is in today (P276 → P17),
 *   their religion (P140) and ethnic group (P172).
 * - People: citizenship (P27), the country their birthplace is in today (P19 → P17),
 *   religion (P140) and ethnic group (P172). For living people, religion and ethnic
 *   group are personal, so they count only when the statement cites a source.
 */
export function groupLinks(events: Entity[], people: Entity[], placeCountry: Map<string, string>): GroupLink[] {
  const out: GroupLink[] = [];
  const seen = new Set<string>();
  const add = (group: string | null | undefined, hint: Hint, member: string, type: GroupLink["type"], via: string) => {
    if (!group || group === member) return;
    const key = `${group}|${member}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ group, hint, member, type, via });
  };

  for (const e of events) {
    for (const g of values(e, "P17")) add(g, "country", e.id, "event", "P17");
    for (const place of values(e, "P276")) add(placeCountry.get(place), "country", e.id, "event", "P276>P17");
    for (const g of values(e, "P140")) add(g, "religion", e.id, "event", "P140");
    for (const g of values(e, "P172")) add(g, "people", e.id, "event", "P172");
  }
  for (const p of people) {
    const living = claims(p, "P570").length === 0;
    const personal = (c: Claim) => !living || isSourced(c);
    for (const g of values(p, "P27")) add(g, "country", p.id, "person", "P27");
    for (const place of values(p, "P19")) add(placeCountry.get(place), "country", p.id, "person", "P19>P17");
    for (const g of values(p, "P140", personal)) add(g, "religion", p.id, "person", "P140");
    for (const g of values(p, "P172", personal)) add(g, "people", p.id, "person", "P172");
  }
  return out;
}

/** What kind of page a group gets, or null when it is not a country, people group or religion we can tell. */
export function groupKind(e: Entity, hints: Set<Hint>): GroupKind | null {
  if (hints.has("religion")) return "religion";
  if (hints.has("people")) return "people";
  const kinds = values(e, "P31");
  if (claims(e, "P576").length) return "former_country";
  if (kinds.some((k) => COUNTRY_CLASSES.has(k))) return "country";
  if (kinds.some((k) => FORMER_CLASSES.has(k))) return "former_country";
  return null;
}

/** Names people type: the label, other names ("Persia" for Iran) and adjectives ("Egyptian"). */
function names(e: Entity, lang: "en" | "ar"): string[] {
  const demonyms = claims(e, "P1549").flatMap((c) => {
    const v = c.mainsnak.datavalue;
    if (v?.type !== "monolingualtext") return [];
    const { text, language } = v.value as { text: string; language: string };
    return language === lang ? [text.toLowerCase().trim()] : [];
  });
  return [...new Set([...entityKeywords(e, lang, 20), ...demonyms])].slice(0, 30);
}

/**
 * A group page. Its time range covers every member: a country's page runs from its
 * oldest event, not from the year the modern state was founded.
 */
export function buildGroup(
  e: Entity,
  kind: GroupKind,
  events: ImportEvent[],
  people: { wikidataId: string; birthYear: number }[],
  via: Record<string, string>,
  ctx: BuildContext,
): ImportTopic | null {
  const title = e.sitelinks?.enwiki?.title ?? null;
  const enName = title ? cleanTitle(title) : label(e, "en");
  if (!enName) return null;
  const span = entitySpan(e);
  const members = [...events].sort((a, b) => a.startYear - b.startYear || a.importance - b.importance);
  const years = [...members.map((m) => m.startYear), ...people.map((p) => p.birthYear)];
  if (span && kind !== "people" && kind !== "religion") years.push(span.start.year);
  if (!years.length) return null;
  const startYear = Math.min(...years);
  let endYear: number | null = null;
  if (kind === "former_country") {
    const dissolved = claims(e, "P576").length ? (span?.end?.year ?? null) : null;
    const lastEvent = members.length ? Math.max(...members.map((m) => m.endYear ?? m.startYear)) : null;
    endYear = Math.max(...[dissolved, lastEvent].filter((y): y is number => y != null), startYear);
    if (endYear > ctx.currentYear) endYear = null;
  }

  const enLead = title ? ctx.leads.en.get(title) : undefined;
  const ar = e.sitelinks?.arwiki?.title ?? null;
  const arLead = ar ? ctx.leads.ar.get(ar) : undefined;
  const arName = label(e, "ar") ?? (ar ? cleanTitle(ar) : null);
  const enDescription = description(e, "en");
  const source = (lead: typeof enLead) =>
    lead ? { url: lead.url, title: lead.title, revisionId: lead.revisionId } : null;
  const listed = people.slice(0, MAX_GROUP_PEOPLE);
  const memberIds = new Set([...members.map((m) => m.wikidataId), ...listed.map((p) => p.wikidataId)]);

  return {
    slug: slugify(enName) || e.id.toLowerCase(),
    wikidataId: e.id,
    kind,
    isSensitive: false,
    startYear,
    endYear,
    isApproximate: false,
    text: {
      en: {
        name: (enName.charAt(0).toUpperCase() + enName.slice(1)).slice(0, 120),
        summary: enLead
          ? summarize(enLead.extract, 600)
          : enDescription
            ? `${enDescription.charAt(0).toUpperCase()}${enDescription.slice(1)}.`
            : null,
        keywords: names(e, "en"),
        source: source(enLead),
      },
      ar: arName
        ? {
            name: arName.slice(0, 120),
            summary: arLead ? summarize(arLead.extract, 600) : null,
            keywords: names(e, "ar"),
            source: source(arLead),
          }
        : null,
    },
    events: members.map((m) => m.wikidataId),
    people: listed.map((p) => p.wikidataId),
    via: Object.fromEntries(Object.entries(via).filter(([id]) => memberIds.has(id))),
    successors: [],
  };
}
