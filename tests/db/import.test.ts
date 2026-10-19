/**
 * Loads a small import bundle into the test database and reads it back through
 * the website's queries. Cleans up after itself. Skipped without DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildEvent, buildPerson, buildTopic, type BuildContext } from "../../scripts/import/build";
import { loadBundle } from "../../scripts/import/load";
import { BundleSchema, type Bundle } from "../../scripts/import/model";
import type { Entity } from "../../scripts/import/wikidata";
import type { Lead } from "../../scripts/import/wikipedia";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 2, onnotice: () => {} }) : null;

const people = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../fixtures/import/people.json"), "utf8"),
) as Record<string, Entity>;

const NEW_EVENT = "Q999999901";
const time = (t: string) => ({ type: "time", value: { time: t, precision: 11 } }) as const;
const claim = (property: string, datavalue: { type: string; value: unknown }) => ({
  rank: "normal" as const,
  mainsnak: { snaktype: "value" as const, property, datavalue },
});
const lead = (title: string, extract: string): Lead => ({
  title,
  url: `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`,
  revisionId: 42,
  extract,
});

function testBundle(): Bundle {
  // Saddam Hussein took part in the new test event, so his life timeline should link to it.
  const saddam: Entity = structuredClone(people.Q1316);
  saddam.claims!.P1344 = [claim("P1344", { type: "wikibase-entityid", value: { id: NEW_EVENT } })];
  const ctx: BuildContext = {
    labels: new Map([
      ["Q165444", { en: "Al-Awja", ar: "العوجة" }],
      ["Q1476165", { en: "President of Iraq", ar: "رئيس جمهورية العراق" }],
      [NEW_EVENT, { en: "Test summit", ar: null }],
    ]),
    leads: {
      en: new Map([
        ["Saddam Hussein", lead("Saddam Hussein", "Saddam Hussein was an Iraqi politician.")],
        ["First Intifada", lead("First Intifada", "Imported text that must not replace the hand-written one.")],
        ["Test summit", lead("Test summit", "A summit invented for this test, held in 1990.")],
        ["Israeli–Palestinian conflict", lead("Israeli–Palestinian conflict", "Imported topic text.")],
      ]),
      ar: new Map(),
    },
    images: new Map(),
    spans: new Map([[NEW_EVENT, { start: { year: 1990, date: null, approximate: false }, end: null }]]),
    sitelinks: new Map([
      ["Q1316", 171],
      ["Q49105", 60],
      [NEW_EVENT, 120],
    ]),
    seeds: new Map([["Q49105", "first-intifada"]]),
    siteEvents: new Set([NEW_EVENT]),
    currentYear: 2026,
  };
  const intifada: Entity = {
    id: "Q49105",
    labels: { en: { value: "First Intifada" } },
    sitelinks: { enwiki: { title: "First Intifada" } },
    claims: {
      P580: [claim("P580", time("+1987-12-08T00:00:00Z"))],
      P582: [claim("P582", time("+1993-09-13T00:00:00Z"))],
    },
  };
  const summit: Entity = {
    id: NEW_EVENT,
    labels: { en: { value: "Test summit" }, ar: { value: "قمة الاختبار" } },
    descriptions: { ar: { value: "قمة للاختبار عُقدت عام 1990 لأغراض هذا الاختبار فقط" } },
    sitelinks: { enwiki: { title: "Test summit" } },
    claims: { P585: [claim("P585", time("+1990-08-02T00:00:00Z"))] },
  };
  const events = [buildEvent(intifada, ctx)!, buildEvent(summit, ctx)!];
  const topic = buildTopic(
    {
      slug: "israeli-palestinian-conflict",
      article: "Israeli–Palestinian conflict",
      sensitive: true,
      events: [],
      people: [],
    },
    {
      id: "Q151622",
      labels: { en: { value: "Israeli–Palestinian conflict" } },
      sitelinks: { enwiki: { title: "Israeli–Palestinian conflict" } },
    },
    events,
    ["Q1316"],
    ctx,
  )!;
  return BundleSchema.parse({
    generatedAt: "2026-10-17T12:00:00.000Z",
    images: [],
    events,
    people: [buildPerson(saddam, ctx)],
    topics: [topic],
    seedLinks: [{ slug: "first-intifada", wikidataId: "Q49105" }],
  });
}

describe.skipIf(!url)("importer load", () => {
  let queries: typeof import("@/lib/db/queries");
  let before: { title: string; summary: string };

  beforeAll(async () => {
    queries = await import("@/lib/db/queries");
    [before] = await sql!`
      select t.title, t.summary from event_translations t join events e on e.id = t.event_id
      where e.slug = 'first-intifada' and t.locale = 'en'`;
    await loadBundle(sql!, testBundle());
  });

  afterAll(async () => {
    await sql!.begin(async (tx) => {
      await tx`delete from people where wikidata_id = 'Q1316'`;
      await tx`delete from events where wikidata_id = ${NEW_EVENT}`;
      await tx`update events set wikidata_id = null, sitelinks = null where slug = 'first-intifada'`;
      await tx`update topics set wikidata_id = null where slug = 'israeli-palestinian-conflict'`;
      await tx`delete from sources where revision_id = 42`;
    });
    await sql?.end();
  });

  it("links seed events to Wikidata without touching their text or dates", async () => {
    const [row] = await sql!`
      select e.wikidata_id, e.start_year, e.sitelinks, t.title, t.summary, t.origin
      from events e join event_translations t on t.event_id = e.id and t.locale = 'en'
      where e.slug = 'first-intifada'`;
    expect(row).toMatchObject({ wikidata_id: "Q49105", start_year: 1987, sitelinks: 60, origin: "manual" });
    expect({ title: row.title, summary: row.summary }).toEqual(before);
  });

  it("adds new events with their source", async () => {
    const page = (await queries.getEventPage("en", "test-summit"))!;
    expect(page.event).toMatchObject({ title: "Test summit", startYear: 1990, importance: 1 });
    expect(page.source).toMatchObject({ title: "Test summit", license: "CC BY-SA 4.0" });
    expect(page.people.map((p) => p.slug)).toEqual(["saddam-hussein"]);
    expect(page.topics.map((t) => t.slug)).toContain("israeli-palestinian-conflict");
    const ar = (await queries.getEventPage("ar", "test-summit"))!;
    expect(ar.event).toMatchObject({ title: "قمة الاختبار", textLocale: "ar" });
  });

  it("serves a person page with a life timeline", async () => {
    const page = (await queries.getPersonPage("en", "saddam-hussein"))!;
    expect(page.person).toMatchObject({
      name: "Saddam Hussein",
      birthYear: 1937,
      deathYear: 2006,
      birthPlace: "Al-Awja",
    });
    expect(page.source?.url).toBe("https://en.wikipedia.org/wiki/Saddam_Hussein");
    expect(page.life[0]).toMatchObject({ kind: "birth", label: "Born in Al-Awja" });
    expect(page.life).toContainEqual(expect.objectContaining({ kind: "event", eventSlug: "test-summit" }));
    // An event in their own life is not repeated as a world event.
    expect(page.world.map((w) => w.slug)).not.toContain("test-summit");
    expect(page.life).toContainEqual(expect.objectContaining({ kind: "position", label: "President of Iraq" }));
    expect(page.topics.map((t) => t.slug)).toEqual(["israeli-palestinian-conflict"]);

    const ar = (await queries.getPersonPage("ar", "saddam-hussein"))!;
    expect(ar.person.name).toBe("صدام حسين");
    expect(ar.life[0]).toMatchObject({ label: "وُلد في العوجة", labelLocale: "ar" });
  });

  it("keeps a hand-written topic's text and adds its events and people", async () => {
    const page = (await queries.getTopicPage("en", "israeli-palestinian-conflict"))!;
    expect(page.topic.name).toBe("Israeli–Palestinian conflict");
    expect(page.topic.summary).not.toBe("Imported topic text.");
    expect(page.topic.startYear).toBe(1917);
    expect(page.events.map((e) => e.slug)).toEqual(expect.arrayContaining(["first-intifada", "test-summit"]));
    // Events run in time order.
    const years = page.events.map((e) => e.startYear);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(page.people.map((p) => p.slug)).toEqual(["saddam-hussein"]);
  });

  it("makes people searchable", async () => {
    const data = await queries.getSearchData("ar");
    expect(data.people).toContainEqual(
      expect.objectContaining({ slug: "saddam-hussein", name: "صدام حسين", textLocale: "ar" }),
    );
    const { searchSite } = await import("@/lib/search/server");
    const [first] = await searchSite("en", "saddam husein");
    expect(first).toMatchObject({ type: "person", person: { slug: "saddam-hussein" } });
  });

  it("can run again without duplicating anything", async () => {
    const count = () => sql!`
      select (select count(*)::int from events) as events, (select count(*)::int from person_events) as life,
        (select count(*)::int from topic_events) as members, (select count(*)::int from sources) as sources`;
    const [a] = await count();
    await loadBundle(sql!, testBundle());
    const [b] = await count();
    expect(b).toEqual(a);
  });

  it("removes imported text a later run no longer gives, and keeps hand-written text", async () => {
    const bundle = testBundle();
    for (const e of bundle.events) e.text.ar = null;
    await loadBundle(sql!, bundle);
    const rows = await sql!`
      select e.slug, t.locale from event_translations t join events e on e.id = t.event_id
      where e.slug in ('test-summit', 'first-intifada') order by 1, 2`;
    expect(rows).toEqual([
      { slug: "first-intifada", locale: "ar" },
      { slug: "first-intifada", locale: "en" },
      { slug: "test-summit", locale: "en" },
    ]);
    const ar = (await queries.getEventPage("ar", "test-summit"))!;
    expect(ar.event).toMatchObject({ title: "Test summit", textLocale: "en" });
  });
});
