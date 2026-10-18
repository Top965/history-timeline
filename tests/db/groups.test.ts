/**
 * Countries, former states and religions: loads them into the test database and
 * reads them back through the website's queries. Cleans up after itself.
 * Skipped without DATABASE_URL.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadBundle } from "../../scripts/import/load";
import { BundleSchema, type Bundle, type ImportEvent, type ImportPerson } from "../../scripts/import/model";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 2, onnotice: () => {} }) : null;

const BATTLE = "Q999999801";
const TREATY = "Q999999802";
const PERSON = "Q999999803";
const COUNTRY = "Q999999811";
const FORMER = "Q999999812";
const RELIGION = "Q999999813";

const event = (wikidataId: string, title: string, startYear: number): ImportEvent => ({
  wikidataId,
  slug: title.toLowerCase().replace(/ /g, "-"),
  seedSlug: null,
  startYear,
  endYear: null,
  startDate: null,
  endDate: null,
  isApproximate: false,
  importance: 3,
  sitelinks: 20,
  latitude: null,
  longitude: null,
  image: null,
  text: { en: { title, summary: `${title}.`, placeLabel: "Testland", keywords: [], source: null }, ar: null },
});

const person: ImportPerson = {
  wikidataId: PERSON,
  slug: "testa-groupson",
  birthYear: 1900,
  deathYear: 1980,
  birthDate: null,
  deathDate: null,
  isApproximate: false,
  sitelinks: 40,
  image: null,
  text: {
    en: {
      name: "Testa Groupson",
      description: null,
      biography: null,
      birthPlace: null,
      deathPlace: null,
      keywords: [],
      source: null,
    },
    ar: null,
  },
  life: [],
  notes: [],
};

const group = (
  wikidataId: string,
  kind: "country" | "former_country" | "religion",
  name: string,
  ar: string | null,
  keywords: string[],
  members: { events: string[]; people: string[]; via: Record<string, string> },
  extra: { endYear?: number | null; successors?: string[] } = {},
) => ({
  slug: name.toLowerCase().replace(/ /g, "-"),
  wikidataId,
  kind,
  isSensitive: false,
  startYear: 1500,
  endYear: extra.endYear ?? null,
  isApproximate: false,
  text: {
    en: { name, summary: `${name} is a test.`, keywords, source: null },
    ar: ar ? { name: ar, summary: null, keywords: [ar], source: null } : null,
  },
  ...members,
  successors: extra.successors ?? [],
});

function bundle(countryEvents: string[]): Bundle {
  return BundleSchema.parse({
    generatedAt: "2026-10-18T12:00:00.000Z",
    images: [],
    events: [event(BATTLE, "Battle of Groupton", 1500), event(TREATY, "Treaty of Groupton", 1950)],
    people: [person],
    topics: [
      group(COUNTRY, "country", "Testland", "أرض الاختبار", ["testland", "old testia", "testlander"], {
        events: countryEvents,
        people: [PERSON],
        via: { ...Object.fromEntries(countryEvents.map((e) => [e, "P276>P17"])), [PERSON]: "P27" },
      }),
      group(
        FORMER,
        "former_country",
        "Empire of Testia",
        null,
        ["empire of testia"],
        { events: [BATTLE], people: [], via: { [BATTLE]: "P17" } },
        { endYear: 1922, successors: [COUNTRY] },
      ),
      group(RELIGION, "religion", "Testism", null, ["testism"], {
        events: [],
        people: [PERSON],
        via: { [PERSON]: "P140" },
      }),
    ],
    seedLinks: [],
  });
}

describe.skipIf(!url)("countries, former states and religions", () => {
  let queries: typeof import("@/lib/db/queries");

  beforeAll(async () => {
    queries = await import("@/lib/db/queries");
    await loadBundle(sql!, bundle([BATTLE, TREATY]));
  });

  afterAll(async () => {
    await sql!.begin(async (tx) => {
      await tx`delete from topics where wikidata_id like 'Q9999998%'`;
      await tx`delete from people where wikidata_id like 'Q9999998%'`;
      await tx`delete from events where wikidata_id like 'Q9999998%'`;
    });
    await sql?.end();
  });

  it("serves a country page with the source of every link and the states before it", async () => {
    const page = (await queries.getTopicPage("en", "testland"))!;
    expect(page.topic).toMatchObject({ kind: "country", name: "Testland", endYear: null });
    expect(page.events.map((e) => [e.slug, e.source])).toEqual([
      ["battle-of-groupton", { wikidataId: BATTLE, via: "P276>P17" }],
      ["treaty-of-groupton", { wikidataId: TREATY, via: "P276>P17" }],
    ]);
    expect(page.eventTotal).toBe(2);
    expect(page.people).toEqual([
      expect.objectContaining({ slug: "testa-groupson", source: { wikidataId: PERSON, via: "P27" } }),
    ]);
    expect(page.predecessors).toEqual([expect.objectContaining({ slug: "empire-of-testia", kind: "former_country" })]);
    expect(page.successors).toEqual([]);

    const former = (await queries.getTopicPage("en", "empire-of-testia"))!;
    expect(former.topic).toMatchObject({ kind: "former_country", endYear: 1922 });
    expect(former.successors.map((s) => s.slug)).toEqual(["testland"]);

    const ar = (await queries.getTopicPage("ar", "testland"))!;
    expect(ar.topic.name).toBe("أرض الاختبار");
  });

  it("shows countries and religions on event and person pages", async () => {
    const battle = (await queries.getEventPage("en", "battle-of-groupton"))!;
    expect(battle.topics.map((t) => [t.slug, t.kind])).toEqual([
      ["testland", "country"],
      ["empire-of-testia", "former_country"],
    ]);
    const p = (await queries.getPersonPage("en", "testa-groupson"))!;
    expect(p.topics.map((t) => t.kind).sort()).toEqual(["country", "religion"]);
  });

  it("finds a country by another name or adjective", async () => {
    const { searchSite } = await import("@/lib/search/server");
    for (const q of ["old testia", "testlander", "أرض الاختبار"]) {
      const [first] = await searchSite(/\p{Script=Arabic}/u.test(q) ? "ar" : "en", q);
      expect(first, q).toMatchObject({ type: "topic", topic: { slug: "testland", kind: "country" } });
    }
  });

  it("drops links Wikidata no longer makes, and keeps the URL", async () => {
    await sql!`update topics set slug = 'testland-renamed' where wikidata_id = ${COUNTRY}`;
    await loadBundle(sql!, bundle([TREATY]));
    const rows = await sql!`
      select t.slug, e.wikidata_id from topics t join topic_events te on te.topic_id = t.id
      join events e on e.id = te.event_id where t.wikidata_id = ${COUNTRY}`;
    expect(rows).toEqual([{ slug: "testland-renamed", wikidata_id: TREATY }]);
    const [{ n }] = await sql!`select count(*)::int as n from topics where wikidata_id like 'Q9999998%'`;
    expect(n).toBe(3);
  });
});
