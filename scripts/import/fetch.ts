/**
 * The fetch stage: asks Wikidata, Wikipedia and Commons for everything the site
 * needs and returns a validated bundle. Network only; the shaping is in build.ts.
 */
import type { z } from "zod";
import { logger } from "@/lib/log/logger";
import { SEED_ARTICLES } from "./config/seed-articles";
import { TOPICS } from "./config/topics";
import {
  buildEvent,
  buildPerson,
  buildTopic,
  dedupeSlugs,
  disambiguateTitles,
  entitySpan,
  isHuman,
  lifeReferences,
  lifeSpanReferences,
  type BuildContext,
  type Labels,
  type Span,
} from "./build";
import { commonsTitle, getImages } from "./commons";
import { buildGroup, currentCountry, groupKind, groupLinks, MIN_GROUP_MEMBERS, type GroupLink } from "./groups";
import { chunk, type Http } from "./http";
import {
  BundleSchema,
  EventSchema,
  PersonSchema,
  type Bundle,
  type ImportEvent,
  type ImportPerson,
  type ImportTopic,
} from "./model";
import { claims, getEntities, itemId, label, sparql, type Entity } from "./wikidata";
import { getLeads, resolveTitles } from "./wikipedia";

export type FetchLimits = {
  /** Events found by class, most covered first. */
  events: number;
  /** Minimum number of Wikipedia editions for an event found by class. */
  eventMinSitelinks: number;
  /** People found by coverage, most covered first. */
  people: number;
  /** Minimum number of Wikipedia editions for a person found by occupation. */
  personMinSitelinks: number;
  /** Events added automatically per `auto` topic. */
  autoTopicEvents: number;
};

export const DEFAULT_LIMITS: FetchLimits = {
  events: 10_000,
  eventMinSitelinks: 12,
  people: 10_000,
  personMinSitelinks: 35,
  autoTopicEvents: 40,
};

/** Kinds of things that belong on the timeline (wars, battles, revolutions, treaties, disasters…). */
const EVENT_CLASSES = [
  "Q198", // war
  "Q178561", // battle
  "Q10931", // revolution
  "Q131569", // treaty
  "Q2223653", // terrorist attack
  "Q3882219", // assassination
  "Q3839081", // disaster
  "Q44512", // epidemic
  "Q45382", // coup d'état
  "Q188055", // siege
  "Q3199915", // massacre
  "Q124734", // rebellion
  "Q1190554", // occurrence
  "Q8065", // natural disaster
  "Q175331", // demonstration
  "Q625994", // convention / conference
  "Q93288", // contract
  "Q645883", // military operation
  "Q7944", // earthquake
  "Q168983", // conflagration
  "Q350604", // armed conflict
  "Q6934728", // peace treaty
  "Q2001676", // offensive
  "Q24336466", // invasion
  "Q1261499", // naval battle
  "Q2380335", // election (national)
  "Q1656682", // event
  "Q159821", // Summer Olympic Games
];

/** The only statements build.ts reads; the rest are dropped right away to keep memory small. */
export const USED_CLAIMS = [
  "P31",
  "P18",
  "P585",
  "P580",
  "P582",
  "P571",
  "P576",
  "P577",
  "P625",
  "P276",
  "P17",
  "P30",
  "P569",
  "P570",
  "P19",
  "P20",
  "P39",
  "P54",
  "P607",
  "P166",
  "P1344",
  // Countries, people groups and religions (groups.ts).
  "P27",
  "P140",
  "P172",
  "P1366",
  "P1549",
];

/** Recurring things found by class that are not moments in history (holidays, league seasons). */
const NOT_EVENTS = new Set([
  "Q1197685", // public holiday
  "Q1445650", // holiday
  "Q15275719", // recurring event
  "Q27020041", // sports season
  "Q1539532", // sports season of a sports club
  "Q132241", // festival
]);

const ids = (rows: Record<string, string>[], key: string) => rows.map((r) => r[key]).filter((x) => /^Q\d+$/.test(x));

/** One query per class: a single query over every class times out at this size. */
async function eventCandidates(http: Http, limits: FetchLimits): Promise<Map<string, number>> {
  const all = new Map<string, number>();
  const perClass = await Promise.all(
    EVENT_CLASSES.map((cls) =>
      sparql(
        http,
        `SELECT ?e ?sl WHERE { ?e wdt:P31 wd:${cls} ; wikibase:sitelinks ?sl . FILTER(?sl >= ${limits.eventMinSitelinks}) }
         ORDER BY DESC(?sl) LIMIT ${limits.events}`,
        `wikidata.sparql.events.${cls}`,
      ),
    ),
  );
  for (const rows of perClass) for (const r of rows) all.set(r.e, Math.max(all.get(r.e) ?? 0, Number(r.sl)));
  return new Map([...all].sort((a, b) => b[1] - a[1]).slice(0, limits.events));
}

/**
 * What notable people did, for finding them. WDQS cannot rank all 12 million
 * humans by coverage within its time limit, but it can rank each occupation.
 */
const OCCUPATIONS = [
  "Q82955", // politician
  "Q116", // monarch
  "Q189290", // military officer
  "Q47064", // military personnel
  "Q193391", // diplomat
  "Q937857", // association football player
  "Q3665646", // basketball player
  "Q10833314", // tennis player
  "Q11338576", // boxer
  "Q11513337", // athletics competitor
  "Q10871364", // baseball player
  "Q378622", // racing driver
  "Q169470", // physicist
  "Q170790", // mathematician
  "Q593644", // chemist
  "Q901", // scientist
  "Q39631", // physician
  "Q205375", // inventor
  "Q11900058", // explorer
  "Q4964182", // philosopher
  "Q1234713", // theologian
  "Q36180", // writer
  "Q49757", // poet
  "Q1028181", // painter
  "Q1281618", // sculptor
  "Q36834", // composer
  "Q177220", // singer
  "Q33999", // actor
  "Q2526255", // film director
  "Q43845", // businessperson
  "Q42603", // priest
  "Q1423891", // religious leader
  "Q1622272", // university teacher
  "Q15253558", // activist
  "Q1930187", // journalist
  "Q40348", // lawyer
  "Q16533", // judge
  "Q42973", // architect
  "Q11631", // astronaut
  "Q12299841", // cricketer
  "Q10873124", // chess player
  "Q10843402", // swimmer
  "Q1999841", // Islamic scholar
  "Q82594", // computer scientist
  "Q188094", // economist
];

async function peopleCandidates(http: Http, limits: FetchLimits): Promise<Map<string, number>> {
  const all = new Map<string, number>();
  for (const occ of OCCUPATIONS) {
    const rows = await sparql(
      http,
      `SELECT ?p ?sl WHERE { ?p wdt:P106 wd:${occ} ; wikibase:sitelinks ?sl . FILTER(?sl >= ${limits.personMinSitelinks}) }
       ORDER BY DESC(?sl) LIMIT ${limits.people}`,
      `wikidata.sparql.people.${occ}`,
    );
    for (const r of rows) all.set(r.p, Math.max(all.get(r.p) ?? 0, Number(r.sl)));
  }
  return new Map([...all].sort((a, b) => b[1] - a[1]).slice(0, limits.people));
}

/** The most covered items Wikidata records as part of a topic. */
async function topicParts(http: Http, topicId: string, limit: number): Promise<string[]> {
  const rows = await sparql(
    http,
    `SELECT ?e ?sl WHERE {
       { ?e wdt:P361 wd:${topicId} } UNION { ?e wdt:P361/wdt:P361 wd:${topicId} } UNION { ?e wdt:P3450 wd:${topicId} }
       UNION { wd:${topicId} wdt:P527 ?e }
       ?e wikibase:sitelinks ?sl . FILTER(?sl >= 15)
     } ORDER BY DESC(?sl) LIMIT ${limit}`,
    `wikidata.sparql.topic.${topicId}`,
  );
  return ids(rows, "e");
}

/** Sitelink counts for items found some other way (config titles). */
export async function sitelinkCounts(http: Http, qids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const batch of chunk(qids, 300)) {
    const rows = await sparql(
      http,
      `SELECT ?x ?sl WHERE { VALUES ?x { ${batch.map((q) => `wd:${q}`).join(" ")} } ?x wikibase:sitelinks ?sl }`,
      "wikidata.sparql.sitelinks",
    );
    for (const r of rows) out.set(r.x, Number(r.sl));
  }
  return out;
}

/**
 * Start and end years of wars and events people took part in. WDQS returns
 * XSD dates where year 0 is 1 BCE, so years at or below zero shift by one.
 */
export async function yearSpans(http: Http, qids: string[]): Promise<Map<string, Span>> {
  const out = new Map<string, Span>();
  const year = (v: string | undefined) => {
    const m = v?.match(/^(-?)(\d+)-/);
    if (!m) return null;
    const y = Number(m[2]) * (m[1] ? -1 : 1);
    return y <= 0 ? y - 1 : y;
  };
  for (const batch of chunk(qids, 250)) {
    const rows = await sparql(
      http,
      `SELECT ?x (MIN(?s) AS ?start) (MAX(?e) AS ?end) WHERE {
         VALUES ?x { ${batch.map((q) => `wd:${q}`).join(" ")} }
         OPTIONAL { ?x wdt:P580|wdt:P585|wdt:P571 ?s }
         OPTIONAL { ?x wdt:P582|wdt:P576 ?e }
       } GROUP BY ?x`,
      "wikidata.sparql.spans",
    );
    for (const r of rows) {
      const s = year(r.start);
      if (s == null) continue;
      const e = year(r.end);
      out.set(r.x, {
        start: { year: s, date: null, approximate: false },
        end: e != null && e > s ? { year: e, date: null, approximate: false } : null,
      });
    }
  }
  return out;
}

export async function labelsFor(http: Http, qids: string[]): Promise<Labels> {
  const entities = await getEntities(http, qids, ["labels"]);
  const out: Labels = new Map();
  for (const [id, e] of entities) out.set(id, { en: label(e, "en"), ar: label(e, "ar") });
  return out;
}

export async function leadsFor(http: Http, entities: Entity[]): Promise<BuildContext["leads"]> {
  const en = entities.map((e) => e.sitelinks?.enwiki?.title).filter((t): t is string => !!t);
  const ar = entities.map((e) => e.sitelinks?.arwiki?.title).filter((t): t is string => !!t);
  const [enLeads, arLeads] = await Promise.all([getLeads(http, "en", en), getLeads(http, "ar", ar)]);
  return { en: enLeads, ar: arLeads };
}

const pointedTo = (es: Entity[], props: string[]) =>
  es
    .flatMap((e) => props.flatMap((p) => claims(e, p).map((c) => c.mainsnak.datavalue)))
    .flatMap((v) => (v?.type === "wikibase-entityid" ? [(v.value as { id: string }).id] : []));

export async function fetchBundle(http: Http, limits: FetchLimits = DEFAULT_LIMITS): Promise<Bundle> {
  const log = logger.child({ kind: "import", stage: "fetch" });
  const currentYear = new Date().getUTCFullYear();

  // 1. Resolve every Wikipedia title named in the config.
  const configTitles = [
    ...Object.values(SEED_ARTICLES),
    ...TOPICS.flatMap((t) => [t.article, ...t.events, ...(t.exclude ?? []), ...t.people]),
  ];
  const resolved = await resolveTitles(http, "en", configTitles);
  const unresolved = [...new Set(configTitles)].filter((t) => !resolved.has(t));
  if (unresolved.length) log.warn({ titles: unresolved }, "titles not found on Wikipedia");
  const q = (title: string) => resolved.get(title) ?? null;
  const seeds = new Map(
    Object.entries(SEED_ARTICLES).flatMap(([slug, title]) => (q(title) ? [[q(title)!, slug] as const] : [])),
  );

  // 2. Pick candidates.
  const [eventSitelinks, peopleSitelinks] = await Promise.all([
    eventCandidates(http, limits),
    peopleCandidates(http, limits),
  ]);
  log.info({ events: eventSitelinks.size, people: peopleSitelinks.size }, "candidates selected");
  const topicIds = new Map(TOPICS.map((t) => [t.slug, q(t.article)]));
  const autoParts = new Map<string, string[]>();
  for (const t of TOPICS) {
    const id = topicIds.get(t.slug);
    if (t.auto && !t.sensitive && id) autoParts.set(t.slug, await topicParts(http, id, limits.autoTopicEvents));
  }
  const configEventIds = TOPICS.flatMap((t) => t.events.map(q)).filter((x): x is string => !!x);
  const configPeopleIds = TOPICS.flatMap((t) => t.people.map(q)).filter((x): x is string => !!x);
  const eventIds = [
    ...new Set([...eventSitelinks.keys(), ...seeds.keys(), ...configEventIds, ...[...autoParts.values()].flat()]),
  ];
  const peopleIds = [...new Set([...peopleSitelinks.keys(), ...configPeopleIds])];
  const topicEntityIds = [...topicIds.values()].filter((x): x is string => !!x);

  // 3. Full entities.
  const props = ["labels", "descriptions", "aliases", "claims", "sitelinks"];
  const [eventEntities, peopleEntities, topicEntities] = await Promise.all([
    getEntities(http, eventIds, props, undefined, USED_CLAIMS),
    getEntities(http, peopleIds, props, undefined, USED_CLAIMS),
    getEntities(http, topicEntityIds, props, undefined, USED_CLAIMS),
  ]);
  const chosen = new Set([...seeds.keys(), ...configEventIds, ...[...autoParts.values()].flat()]);
  const events = [...eventEntities.values()].filter(
    (e) => !isHuman(e) && (chosen.has(e.id) || !claims(e, "P31").some((c) => NOT_EVENTS.has(itemId(c.mainsnak) ?? ""))),
  );
  const people = [...peopleEntities.values()].filter(isHuman);

  const missingCounts = [...eventIds, ...peopleIds, ...topicEntityIds].filter(
    (id) => !eventSitelinks.has(id) && !peopleSitelinks.has(id),
  );
  const sitelinks = new Map([...eventSitelinks, ...peopleSitelinks, ...(await sitelinkCounts(http, missingCounts))]);

  // 4. Labels, dates, leads and photos.
  const placeIds = pointedTo(events, ["P276", "P17", "P30"]);
  const lifeIds = people.flatMap(lifeReferences);
  const spanIds = [...new Set(people.flatMap(lifeSpanReferences))];
  const known = new Map(events.map((e) => [e.id, e]));
  const [labels, otherSpans, leads] = await Promise.all([
    labelsFor(http, [...new Set([...placeIds, ...lifeIds])]),
    yearSpans(
      http,
      spanIds.filter((id) => !known.has(id)),
    ),
    leadsFor(http, [...events, ...people, ...topicEntities.values()]),
  ]);
  const spans = new Map(otherSpans);
  for (const id of spanIds) {
    const e = known.get(id);
    const s = e && entitySpan(e);
    if (s) spans.set(id, s);
  }
  const imageNames = [...events, ...people].flatMap((e) =>
    claims(e, "P18").flatMap((c) =>
      c.mainsnak.datavalue?.type === "string" ? [c.mainsnak.datavalue.value as string] : [],
    ),
  );
  const images = await getImages(http, imageNames);

  // 5. Build records. One record Wikidata got wrong must not stop the whole import:
  // it is left out with a warning saying why.
  const valid =
    <T extends { wikidataId: string | null }>(kind: string, schema: z.ZodType<T>) =>
    (r: T) => {
      const check = schema.safeParse(r);
      if (!check.success)
        log.warn({ kind, wikidataId: r.wikidataId, issues: check.error.issues }, "invalid record left out");
      return check.success;
    };
  const ctx: BuildContext = { labels, leads, images, spans, sitelinks, seeds, currentYear, siteEvents: new Set() };
  const builtEvents = dedupeSlugs(
    disambiguateTitles(
      events
        .map((e) => buildEvent(e, ctx))
        .filter((x): x is ImportEvent => !!x)
        .filter(valid("event", EventSchema)),
    ),
    (r) => r.startYear,
    new Set(),
    (r) => r.seedSlug != null,
  );
  ctx.siteEvents = new Set(builtEvents.map((e) => e.wikidataId));
  const builtPeople = dedupeSlugs(
    people
      .map((e) => buildPerson(e, ctx))
      .filter((x) => !!x)
      .filter(valid("person", PersonSchema)),
    (r) => r.birthYear,
  );
  const eventById = new Map(builtEvents.map((e) => [e.wikidataId, e]));
  const personIds = new Set(builtPeople.map((p) => p.wikidataId));

  const topics = TOPICS.flatMap((cfg) => {
    const e = topicEntities.get(topicIds.get(cfg.slug) ?? "");
    if (!e) {
      log.warn({ topic: cfg.slug }, "topic article not found; skipped");
      return [];
    }
    const exclude = new Set((cfg.exclude ?? []).map(q));
    const members = [...new Set([...cfg.events.map(q), ...(autoParts.get(cfg.slug) ?? [])])]
      .filter((id): id is string => !!id && !exclude.has(id))
      .map((id) => eventById.get(id))
      .filter((x): x is ImportEvent => !!x);
    const topicPeople = cfg.people.map(q).filter((id): id is string => !!id && personIds.has(id));
    const t = buildTopic(cfg, e, members, [...new Set(topicPeople)], ctx);
    return t ? [t] : [];
  });

  topics.push(...(await fetchGroups(http, events, people, eventById, builtPeople, topics, ctx)));

  // Only keep photos something uses.
  const usedImages = new Set([...builtEvents, ...builtPeople].map((r) => r.image).filter(Boolean));
  const bundle: Bundle = {
    generatedAt: new Date().toISOString(),
    images: [...images.values()].filter((i) => usedImages.has(commonsTitle(i.commonsFile))),
    events: builtEvents,
    people: builtPeople,
    topics,
    seedLinks: [...seeds].map(([wikidataId, slug]) => ({ slug, wikidataId })),
  };
  log.info(
    {
      events: bundle.events.length,
      people: bundle.people.length,
      topics: bundle.topics.length,
      images: bundle.images.length,
      lifeEvents: bundle.people.reduce((n, p) => n + p.life.length, 0),
    },
    "bundle built",
  );
  return BundleSchema.parse(bundle);
}

/**
 * Countries, former states, people groups and religions (see groups.ts). A group that
 * is already a hand-picked topic (the Ottoman Empire) adds its members to that topic
 * instead, unless the topic is sensitive: those lists are exactly what the config says.
 */
async function fetchGroups(
  http: Http,
  events: Entity[],
  people: Entity[],
  eventById: Map<string, ImportEvent>,
  builtPeople: ImportPerson[],
  topics: ImportTopic[],
  ctx: BuildContext,
): Promise<ImportTopic[]> {
  const log = logger.child({ kind: "import", stage: "fetch.groups" });
  const personById = new Map(builtPeople.map((p) => [p.wikidataId, p]));
  const onSite = (l: GroupLink) => (l.type === "event" ? eventById.has(l.member) : personById.has(l.member));

  // Which country each event location and birthplace is in today.
  const placeIds = [...new Set(pointedTo([...events, ...people], ["P276", "P19"]))];
  const places = await getEntities(http, placeIds, ["claims"], undefined, ["P17"]);
  const placeCountry = new Map<string, string>();
  for (const [id, e] of places) {
    const country = currentCountry(e);
    if (country) placeCountry.set(id, country);
  }

  const links = groupLinks(
    events.filter((e) => eventById.has(e.id)),
    people.filter((p) => personById.has(p.id)),
    placeCountry,
  ).filter(onSite);
  const byGroup = new Map<string, GroupLink[]>();
  for (const l of links) byGroup.set(l.group, [...(byGroup.get(l.group) ?? []), l]);

  const entities = await getEntities(
    http,
    [...byGroup.keys()],
    ["labels", "descriptions", "aliases", "claims", "sitelinks"],
    undefined,
    USED_CLAIMS,
  );
  const chosen = [...entities.values()].flatMap((e) => {
    const members = byGroup.get(e.id) ?? [];
    const kind = groupKind(e, new Set(members.map((m) => m.hint)));
    if (!kind || (kind !== "country" && members.length < MIN_GROUP_MEMBERS)) return [];
    return [{ e, kind, members }];
  });
  const leads = await leadsFor(
    http,
    chosen.map((c) => c.e),
  );
  const groupCtx: BuildContext = { ...ctx, leads };

  const byQid = new Map(topics.map((t) => [t.wikidataId, t]));
  const used = new Set(topics.map((t) => t.slug));
  const out: ImportTopic[] = [];
  let merged = 0;
  for (const { e, kind, members } of chosen) {
    const via = Object.fromEntries(members.map((m) => [m.member, m.via]));
    const memberEvents = members.flatMap((m) => (m.type === "event" ? [eventById.get(m.member)!] : []));
    const memberPeople = members
      .flatMap((m) => (m.type === "person" ? [personById.get(m.member)!] : []))
      .sort((a, b) => b.sitelinks - a.sitelinks || a.wikidataId.localeCompare(b.wikidataId));

    const topic = byQid.get(e.id);
    if (topic) {
      if (topic.isSensitive) continue;
      const known = new Set([...topic.events, ...topic.people]);
      const added = [...memberEvents, ...memberPeople].filter((m) => !known.has(m.wikidataId));
      topic.events.push(...memberEvents.filter((m) => !known.has(m.wikidataId)).map((m) => m.wikidataId));
      topic.people.push(...memberPeople.filter((m) => !known.has(m.wikidataId)).map((m) => m.wikidataId));
      for (const m of added) topic.via[m.wikidataId] = via[m.wikidataId];
      merged++;
      continue;
    }
    const group = buildGroup(e, kind, memberEvents, memberPeople, via, groupCtx);
    if (!group) continue;
    const slug = [group.slug, `${group.slug}-${e.id.toLowerCase()}`].find((s) => !used.has(s))!;
    used.add(slug);
    out.push({ ...group, slug });
  }

  // Former states point to the countries that replaced them.
  const countries = new Set(out.filter((g) => g.kind === "country").map((g) => g.wikidataId));
  for (const g of out) {
    if (g.kind !== "former_country") continue;
    const e = entities.get(g.wikidataId)!;
    g.successors = claims(e, "P1366")
      .map((c) => itemId(c.mainsnak))
      .filter((id): id is string => !!id && countries.has(id));
  }

  const count = (kind: string) => out.filter((g) => g.kind === kind).length;
  log.info(
    {
      links: links.length,
      countries: count("country"),
      formerCountries: count("former_country"),
      peoples: count("people"),
      religions: count("religion"),
      mergedIntoTopics: merged,
    },
    "groups built",
  );
  return out;
}
