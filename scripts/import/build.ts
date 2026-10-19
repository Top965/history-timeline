/**
 * Turns raw Wikidata entities, Wikipedia leads and Commons metadata into bundle
 * records. Everything here is pure (no network), so it is tested on saved samples.
 */
import type { CommonsFileInfo } from "../commons/commons";
import type { TopicConfig } from "./config/topics";
import { datesProblem, personNotes } from "./checks";
import { commonsTitle } from "./commons";
import type { ImportEvent, ImportPerson, ImportSource, ImportTopic, LifeEvent } from "./model";
import {
  claims,
  coordinates,
  description,
  firstItem,
  firstTime,
  itemId,
  label,
  qualifierTime,
  type Entity,
  type WdDate,
} from "./wikidata";
import { leadParagraph, MIN_SUMMARY, summarize, trimLead, type Lead } from "./wikipedia";

export type Labels = Map<string, { en: string | null; ar: string | null }>;
export type Span = { start: WdDate; end: WdDate | null };

export type BuildContext = {
  /** Labels of places, offices, teams, awards and wars that entities point to. */
  labels: Labels;
  /** Wikipedia leads keyed by article title. */
  leads: { en: Map<string, Lead>; ar: Map<string, Lead> };
  /** Commons files keyed by "File:…" title; only free files are present. */
  images: Map<string, CommonsFileInfo>;
  /** Dates of wars and events that people took part in. */
  spans: Map<string, Span>;
  /** Events that will be on the site; a person's "took part in" entries are kept only for these. */
  siteEvents: Set<string>;
  sitelinks: Map<string, number>;
  /** Wikidata id → seed event slug. */
  seeds: Map<string, string>;
  currentYear: number;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** "Siege of Baghdad (1258)" → "Siege of Baghdad": the date is shown next to it anyway. */
export const cleanTitle = (title: string) => title.replace(/\s*\([^)]*\)\s*$/, "").trim();

/** URL-safe ASCII slug. Returns "" when nothing Latin is left (the caller then falls back). */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ʻʼ'’`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** How many Wikipedia editions cover it decides how prominent it is on the timeline. */
export const importanceFor = (sitelinks: number): 1 | 2 | 3 => (sitelinks >= 80 ? 1 : sitelinks >= 45 ? 2 : 3);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sentence = (s: string) => (/[.!?؟。]$/.test(s) ? s : `${s}.`);

/** The label and other names of an item, lowercased, for search. */
export function entityKeywords(e: Entity, lang: "en" | "ar", max = 10): string[] {
  const names = [label(e, lang), ...(e.aliases?.[lang] ?? []).map((a) => a.value)].filter((x): x is string => !!x);
  return [...new Set(names.map((n) => n.toLowerCase().trim()).filter((n) => n.length >= 2 && n.length <= 80))].slice(
    0,
    max,
  );
}
const keywords = (e: Entity, lang: "en" | "ar") => entityKeywords(e, lang);

function source(lead: Lead | undefined): ImportSource | null {
  return lead ? { url: lead.url, title: lead.title, revisionId: lead.revisionId } : null;
}

const enTitle = (e: Entity) => e.sitelinks?.enwiki?.title ?? null;
const arTitle = (e: Entity) => e.sitelinks?.arwiki?.title ?? null;

/** When something happened: a point in time, or a start and end. */
export function entitySpan(e: Entity): Span | null {
  // A start time beats a point in time: wars often carry both (the point being when they ended).
  const start = firstTime(e, "P580") ?? firstTime(e, "P585") ?? firstTime(e, "P571") ?? firstTime(e, "P577");
  if (!start) return null;
  let end = firstTime(e, "P582") ?? firstTime(e, "P576");
  if (end && end.year < start.year) end = null;
  if (end && end.year === start.year && (!end.date || end.date === start.date)) end = null;
  return { start, end };
}

/** Keeps a span consistent with the database checks (an end date needs a start date, and comes after it). */
function spanColumns(s: Span) {
  const startDate = s.start.date;
  let endDate = s.end?.date ?? null;
  if (!startDate || (endDate && endDate < startDate)) endDate = null;
  return {
    startYear: s.start.year,
    endYear: s.end?.year ?? null,
    startDate,
    endDate,
    isApproximate: s.start.approximate || !!s.end?.approximate,
  };
}

function imageOf(e: Entity, ctx: BuildContext): string | null {
  for (const c of claims(e, "P18")) {
    const v = c.mainsnak.datavalue;
    if (v?.type !== "string") continue;
    const title = commonsTitle(v.value as string);
    if (ctx.images.has(title)) return title;
  }
  return null;
}

const labelOf = (ctx: BuildContext, id: string | null, lang: "en" | "ar") =>
  id ? (ctx.labels.get(id)?.[lang] ?? null) : null;

/** Most specific place we know: location, else country, else continent. */
function placeOf(e: Entity, ctx: BuildContext, lang: "en" | "ar"): string | null {
  for (const prop of ["P276", "P17", "P30"]) {
    const name = labelOf(ctx, firstItem(e, prop), lang);
    if (name) return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Wikipedia's own pages ("Wikipedia:20th anniversary") and other non-article pages. */
const NOT_AN_ARTICLE = /^(Wikipedia|Portal|Template|Category|Help|Draft|Module|File|Special|Project):/i;

/**
 * An event's summary: the opening of its article, else the Wikidata description,
 * but only when either says something (at least MIN_SUMMARY characters).
 */
function eventSummary(lead: Lead | undefined, desc: string | null, lang: "en" | "ar"): string | null {
  const opening = lead && leadParagraph(lead.extract) ? summarize(lead.extract) : null;
  if (opening) return opening;
  const fallback = desc ? sentence(lang === "en" ? capitalize(desc) : desc) : null;
  return fallback && fallback.length >= MIN_SUMMARY ? fallback : null;
}

/**
 * Different events can share a short title and year (the Serbian and the Russian
 * "Great Retreat" of 1915). Those keep their full Wikipedia title, such as
 * "Great Retreat (Russian)", so the timeline and search can tell them apart.
 */
export function disambiguateTitles(events: ImportEvent[]): ImportEvent[] {
  const key = (e: ImportEvent) => `${e.text.en.title.toLowerCase()}|${e.startYear}`;
  const count = new Map<string, number>();
  for (const e of events) count.set(key(e), (count.get(key(e)) ?? 0) + 1);
  return events.map((e) => {
    const full = e.text.en.source?.title;
    if ((count.get(key(e)) ?? 0) < 2 || !full || full === e.text.en.title) return e;
    return { ...e, text: { ...e.text, en: { ...e.text.en, title: full.slice(0, 200) } } };
  });
}

/** One timeline event, or null when it has no date or no English Wikipedia article. */
export function buildEvent(e: Entity, ctx: BuildContext): ImportEvent | null {
  const span = entitySpan(e);
  const title = enTitle(e);
  if (!span || !title || span.start.year > ctx.currentYear + 1) return null;
  if (NOT_AN_ARTICLE.test(title)) return null;
  const enLead = ctx.leads.en.get(title);
  const enSummary = eventSummary(enLead, description(e, "en"), "en");
  if (!enSummary) return null;

  const ar = arTitle(e);
  const arLead = ar ? ctx.leads.ar.get(ar) : undefined;
  const arName = ar ? cleanTitle(ar) : label(e, "ar");
  // No Arabic text beats a word or two: the page then shows the English and says so.
  const arSummary = eventSummary(arLead, description(e, "ar"), "ar");

  const sitelinks = ctx.sitelinks.get(e.id) ?? 0;
  const coords = coordinates(e);
  const seedSlug = ctx.seeds.get(e.id) ?? null;
  return {
    wikidataId: e.id,
    slug: seedSlug ?? (slugify(cleanTitle(title)) || e.id.toLowerCase()),
    seedSlug,
    ...spanColumns(span),
    importance: importanceFor(sitelinks),
    sitelinks,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    image: imageOf(e, ctx),
    text: {
      en: {
        title: cleanTitle(title).slice(0, 200),
        summary: enSummary,
        placeLabel: (placeOf(e, ctx, "en") ?? "—").slice(0, 200),
        keywords: keywords(e, "en"),
        source: source(enLead),
      },
      ar:
        arName && arSummary
          ? {
              title: arName.slice(0, 200),
              summary: arSummary,
              placeLabel: (placeOf(e, ctx, "ar") ?? placeOf(e, ctx, "en") ?? "—").slice(0, 200),
              keywords: keywords(e, "ar"),
              source: source(arLead),
            }
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const MAX_AWARDS = 12;

const LIFE_PROPS = [
  { prop: "P39", kind: "position" },
  { prop: "P54", kind: "team" },
  { prop: "P607", kind: "conflict" },
  { prop: "P166", kind: "award" },
  { prop: "P1344", kind: "event" },
] as const;

/** Every item a person's life timeline points to, so their labels and dates can be fetched. */
export function lifeReferences(e: Entity): string[] {
  const ids = [firstItem(e, "P19"), firstItem(e, "P20")];
  for (const { prop } of LIFE_PROPS) for (const c of claims(e, prop)) ids.push(itemId(c.mainsnak));
  return [...new Set(ids.filter((x): x is string => !!x))];
}

/** Items whose dates come from the item itself rather than from the statement (wars, events). */
export function lifeSpanReferences(e: Entity): string[] {
  const ids: string[] = [];
  for (const prop of ["P607", "P1344"]) for (const c of claims(e, prop)) ids.push(itemId(c.mainsnak) ?? "");
  return [...new Set(ids.filter(Boolean))];
}

export function buildLife(e: Entity, ctx: BuildContext): LifeEvent[] {
  const out: LifeEvent[] = [];
  const birth = firstTime(e, "P569");
  const death = firstTime(e, "P570");
  if (birth) {
    const place = firstItem(e, "P19");
    const en = labelOf(ctx, place, "en");
    const ar = labelOf(ctx, place, "ar");
    out.push({
      kind: "birth",
      ...spanColumns({ start: birth, end: null }),
      wikidataId: place,
      label: { en: en ? `Born in ${en}` : "Born", ar: ar ? `وُلد في ${ar}` : "الولادة" },
    });
  }
  if (death && (!birth || death.year >= birth.year)) {
    const place = firstItem(e, "P20");
    const en = labelOf(ctx, place, "en");
    const ar = labelOf(ctx, place, "ar");
    out.push({
      kind: "death",
      ...spanColumns({ start: death, end: null }),
      wikidataId: place,
      label: { en: en ? `Died in ${en}` : "Died", ar: ar ? `تُوفي في ${ar}` : "الوفاة" },
    });
  }

  let awards = 0;
  for (const { prop, kind } of LIFE_PROPS) {
    const rows: LifeEvent[] = [];
    for (const c of claims(e, prop)) {
      const id = itemId(c.mainsnak);
      const en = labelOf(ctx, id, "en");
      if (!id || !en) continue;
      // "Participant in" also lists every club season; only events on the site are worth a row.
      if (kind === "event" && !ctx.siteEvents.has(id)) continue;
      let span: Span | null;
      if (kind === "conflict" || kind === "event") {
        span = ctx.spans.get(id) ?? null;
        const own = qualifierTime(c, "P580") ?? qualifierTime(c, "P585");
        if (own) span = { start: own, end: qualifierTime(c, "P582") ?? null };
      } else {
        const start = qualifierTime(c, "P580") ?? qualifierTime(c, "P585");
        span = start ? { start, end: qualifierTime(c, "P582") } : null;
      }
      if (!span) continue;
      // A fact dated in the future is a typo or a plan, not history: leave it out.
      if (span.start.year > ctx.currentYear) continue;
      if (span.end && (span.end.year < span.start.year || span.end.year > ctx.currentYear + 10))
        span = { start: span.start, end: null };
      // Statements outside the person's lifetime are data errors (or posthumous honours we skip).
      if (birth && span.start.year < birth.year) continue;
      if (death && span.start.year > death.year) continue;
      rows.push({
        kind,
        ...spanColumns(span),
        wikidataId: id,
        label: { en: capitalize(en).slice(0, 300), ar: labelOf(ctx, id, "ar")?.slice(0, 300) ?? null },
      });
    }
    rows.sort((a, b) => a.startYear - b.startYear);
    for (const r of rows) {
      if (kind === "award" && ++awards > MAX_AWARDS) break;
      out.push(r);
    }
  }

  // One row per (kind, item, start year), as the database requires.
  const seen = new Set<string>();
  return out
    .filter((r) => {
      const key = `${r.kind}|${r.wikidataId ?? ""}|${r.startYear}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startYear - b.startYear || (a.kind === "birth" ? -1 : b.kind === "birth" ? 1 : 0));
}

/** A person page, or null without an English article or a year of birth. */
export function buildPerson(e: Entity, ctx: BuildContext): ImportPerson | null {
  const title = enTitle(e);
  const birth = firstTime(e, "P569");
  if (!title || !birth) return null;
  let death = firstTime(e, "P570");
  if (death && death.year < birth.year) death = null;
  // Dates that can't be right would give a wrong timeline: leave the person out.
  if (datesProblem(birth.year, death?.year ?? null, ctx.currentYear)) return null;

  const enLead = ctx.leads.en.get(title);
  const life = buildLife(e, ctx);
  const ar = arTitle(e);
  const arLead = ar ? ctx.leads.ar.get(ar) : undefined;
  const enName = label(e, "en") ?? cleanTitle(title);
  const arName = label(e, "ar") ?? (ar ? cleanTitle(ar) : null);
  const birthPlace = firstItem(e, "P19");
  const deathPlace = firstItem(e, "P20");
  const desc = (lang: "en" | "ar") => {
    const d = description(e, lang);
    return d ? (lang === "en" ? capitalize(d) : d).slice(0, 300) : null;
  };

  return {
    wikidataId: e.id,
    slug: slugify(enName) || slugify(cleanTitle(title)) || e.id.toLowerCase(),
    birthYear: birth.year,
    deathYear: death?.year ?? null,
    birthDate: birth.date,
    deathDate: death?.date ?? null,
    isApproximate: birth.approximate || !!death?.approximate,
    sitelinks: ctx.sitelinks.get(e.id) ?? 0,
    image: imageOf(e, ctx),
    text: {
      en: {
        name: enName.slice(0, 200),
        description: desc("en"),
        biography: enLead ? trimLead(enLead.extract, 2500) : null,
        birthPlace: labelOf(ctx, birthPlace, "en"),
        deathPlace: labelOf(ctx, deathPlace, "en"),
        keywords: keywords(e, "en"),
        source: source(enLead),
      },
      ar: arName
        ? {
            name: arName.slice(0, 200),
            description: desc("ar"),
            biography: arLead ? trimLead(arLead.extract, 2500) : null,
            birthPlace: labelOf(ctx, birthPlace, "ar"),
            deathPlace: labelOf(ctx, deathPlace, "ar"),
            keywords: keywords(e, "ar"),
            source: source(arLead),
          }
        : null,
    },
    life,
    notes: personNotes(
      e,
      {
        birthYear: birth.year,
        deathYear: death?.year ?? null,
        birthPlace: labelOf(ctx, birthPlace, "en"),
        biography: enLead ? enLead.extract : null,
        life,
      },
      ctx.currentYear,
    ),
  };
}

/** Is this entity a human? Used to keep people out of the event list. */
export const isHuman = (e: Entity) => claims(e, "P31").some((c) => itemId(c.mainsnak) === "Q5");

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export function buildTopic(
  cfg: TopicConfig,
  e: Entity,
  events: ImportEvent[],
  people: string[],
  ctx: BuildContext,
): ImportTopic | null {
  const title = enTitle(e);
  const span = entitySpan(e);
  const members = [...events].sort((a, b) => a.startYear - b.startYear || a.importance - b.importance);
  const firstYear = members[0]?.startYear;
  const startYear = cfg.startYear ?? span?.start.year ?? firstYear;
  if (startYear == null) return null;
  let endYear = cfg.endYear !== undefined ? cfg.endYear : (span?.end?.year ?? null);
  if (endYear != null && endYear < startYear) endYear = null;

  const enLead = title ? ctx.leads.en.get(title) : undefined;
  const ar = arTitle(e);
  const arLead = ar ? ctx.leads.ar.get(ar) : undefined;
  const arName = label(e, "ar") ?? (ar ? cleanTitle(ar) : null);
  return {
    slug: cfg.slug,
    wikidataId: e.id,
    kind: "topic",
    isSensitive: !!cfg.sensitive,
    startYear,
    endYear,
    isApproximate: cfg.startYear == null && !!span?.start.approximate,
    text: {
      en: {
        name: capitalize(cleanTitle(title ?? label(e, "en") ?? cfg.article)).slice(0, 120),
        summary: enLead
          ? summarize(enLead.extract, 600)
          : description(e, "en")
            ? sentence(capitalize(description(e, "en")!))
            : null,
        keywords: keywords(e, "en"),
        source: source(enLead),
      },
      ar: arName
        ? {
            name: arName.slice(0, 120),
            summary: arLead ? summarize(arLead.extract, 600) : null,
            keywords: keywords(e, "ar"),
            source: source(arLead),
          }
        : null,
    },
    events: members.map((m) => m.wikidataId),
    people,
    via: {},
    successors: [],
  };
}

/** Makes slugs unique: seed slugs win, then the most-covered item keeps the plain slug. */
export function dedupeSlugs<T extends { slug: string; wikidataId: string; sitelinks: number }>(
  rows: T[],
  yearOf: (r: T) => number,
  taken: Set<string> = new Set(),
  fixed: (r: T) => boolean = () => false,
): T[] {
  const used = new Set(taken);
  for (const r of rows) if (fixed(r)) used.add(r.slug);
  const order = [...rows]
    .filter((r) => !fixed(r))
    .sort((a, b) => b.sitelinks - a.sitelinks || a.wikidataId.localeCompare(b.wikidataId));
  const renamed = new Map<T, string>();
  for (const r of order) {
    const y = yearOf(r);
    const candidates = [r.slug, `${r.slug}-${y < 0 ? `${-y}-bce` : y}`, `${r.slug}-${r.wikidataId.toLowerCase()}`];
    const slug = candidates.find((c) => !used.has(c))!;
    used.add(slug);
    renamed.set(r, slug);
  }
  return rows.map((r) => (renamed.has(r) ? { ...r, slug: renamed.get(r)! } : r));
}
