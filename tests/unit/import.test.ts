import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEvent,
  buildPerson,
  buildTopic,
  cleanTitle,
  dedupeSlugs,
  importanceFor,
  slugify,
  type BuildContext,
} from "../../scripts/import/build";
import { commonsTitle } from "../../scripts/import/commons";
import { BundleSchema } from "../../scripts/import/model";
import { parseTime, type Entity } from "../../scripts/import/wikidata";
import { summarize, trimLead, type Lead } from "../../scripts/import/wikipedia";

/** Saddam Hussein (Q1316) and Lionel Messi (Q615) as Wikidata returned them, trimmed to the statements we read. */
const people = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../fixtures/import/people.json"), "utf8"),
) as Record<string, Entity>;

const lead = (lang: "en" | "ar", title: string, extract: string): Lead => ({
  title,
  url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  revisionId: 123,
  extract,
});

function context(over: Partial<BuildContext> = {}): BuildContext {
  return {
    labels: new Map([
      ["Q165444", { en: "Al-Awja", ar: "العوجة" }],
      ["Q5027295", { en: "Camp Justice", ar: null }],
      ["Q1476165", { en: "President of Iraq", ar: "رئيس جمهورية العراق" }],
      ["Q889817", { en: "Prime Minister of Iraq", ar: "رئيس وزراء العراق" }],
      ["Q82664", { en: "Iran–Iraq War", ar: "الحرب العراقية الإيرانية" }],
      ["Q37643", { en: "Gulf War", ar: "حرب الخليج الثانية" }],
      ["Q545449", { en: "Iraq War", ar: "حرب العراق" }],
      ["Q52535", { en: "Rosario", ar: "روساريو" }],
      ["Q7156", { en: "FC Barcelona", ar: "نادي برشلونة" }],
      ["Q483020", { en: "Paris Saint-Germain F.C.", ar: "نادي باريس سان جيرمان" }],
    ]),
    leads: {
      en: new Map([
        [
          "Saddam Hussein",
          lead(
            "en",
            "Saddam Hussein",
            "Saddam Hussein (28 April 1937 – 30 December 2006) was an Iraqi politician who served as the fifth president of Iraq from 1979 until 2003. He also served as prime minister.\n\nBorn near Tikrit, he joined the Ba'ath Party in 1957.",
          ),
        ],
      ]),
      ar: new Map([["صدام حسين", lead("ar", "صدام حسين", "صدام حسين عبد المجيد التكريتي سياسي عراقي.")]]),
    },
    images: new Map(),
    spans: new Map([
      [
        "Q82664",
        { start: { year: 1980, date: null, approximate: false }, end: { year: 1988, date: null, approximate: false } },
      ],
      [
        "Q37643",
        { start: { year: 1990, date: null, approximate: false }, end: { year: 1991, date: null, approximate: false } },
      ],
      [
        "Q545449",
        { start: { year: 2003, date: null, approximate: false }, end: { year: 2011, date: null, approximate: false } },
      ],
    ]),
    sitelinks: new Map([
      ["Q1316", 171],
      ["Q615", 190],
    ]),
    seeds: new Map(),
    siteEvents: new Set(),
    currentYear: 2026,
    ...over,
  };
}

const event = (over: Partial<Entity> & { claims?: Entity["claims"] } = {}): Entity => ({
  id: "Q49105",
  labels: { en: { value: "First Intifada" }, ar: { value: "الانتفاضة الفلسطينية الأولى" } },
  descriptions: { en: { value: "1987–1993 Palestinian uprising against Israeli occupation" } },
  aliases: { en: [{ value: "Intifada of the stones" }] },
  sitelinks: { enwiki: { title: "First Intifada" }, arwiki: { title: "الانتفاضة الفلسطينية الأولى" } },
  claims: {
    P580: [
      {
        rank: "normal",
        mainsnak: {
          snaktype: "value",
          property: "P580",
          datavalue: { type: "time", value: { time: "+1987-12-08T00:00:00Z", precision: 11 } },
        },
      },
    ],
    P582: [
      {
        rank: "normal",
        mainsnak: {
          snaktype: "value",
          property: "P582",
          datavalue: { type: "time", value: { time: "+1993-09-13T00:00:00Z", precision: 11 } },
        },
      },
    ],
    P17: [
      {
        rank: "normal",
        mainsnak: {
          snaktype: "value",
          property: "P17",
          datavalue: { type: "wikibase-entityid", value: { id: "Q219060" } },
        },
      },
    ],
  },
  ...over,
});

describe("wikidata dates", () => {
  it("reads days, BCE years and coarse precision", () => {
    expect(parseTime({ time: "+1937-04-28T00:00:00Z", precision: 11 })).toEqual({
      year: 1937,
      date: "1937-04-28",
      approximate: false,
    });
    expect(parseTime({ time: "-0044-03-15T00:00:00Z", precision: 11 })).toEqual({
      year: -44,
      date: null,
      approximate: false,
    });
    expect(parseTime({ time: "+1500-00-00T00:00:00Z", precision: 7 })).toMatchObject({ year: 1500, approximate: true });
    expect(parseTime({ time: "+0000-00-00T00:00:00Z", precision: 9 })).toBeNull();
    expect(parseTime({ time: "+1904-04-31T00:00:00Z", precision: 11 })?.date).toBeNull();
    const julian = "http://www.wikidata.org/entity/Q1985786";
    expect(parseTime({ time: "+1453-05-29T00:00:00Z", precision: 11, calendarmodel: julian })).toEqual({
      year: 1453,
      date: null,
      approximate: false,
    });
  });
});

describe("text helpers", () => {
  it("makes ASCII slugs and drops disambiguation", () => {
    expect(slugify("Mustafa Kemal Atatürk")).toBe("mustafa-kemal-ataturk");
    expect(slugify("Qin's wars of unification")).toBe("qins-wars-of-unification");
    expect(slugify("صدام حسين")).toBe("");
    expect(cleanTitle("Siege of Baghdad (1258)")).toBe("Siege of Baghdad");
  });

  it("cuts summaries at a sentence and keeps whole paragraphs in biographies", () => {
    const text = "First sentence here. Second sentence is longer than the first one.\n\nSecond paragraph.";
    expect(summarize(text, 30)).toBe("First sentence here.");
    expect(trimLead(text, 200)).toBe(text);
    expect(trimLead(text, 75)).toBe("First sentence here. Second sentence is longer than the first one.");
  });

  it("ranks by coverage", () => {
    expect([importanceFor(150), importanceFor(60), importanceFor(20)]).toEqual([1, 2, 3]);
  });

  it("normalizes Commons titles", () => {
    expect(commonsTitle("Saddam_Hussein in 1998.png")).toBe("File:Saddam Hussein in 1998.png");
  });
});

describe("people", () => {
  it("builds Saddam Hussein's page and life timeline", () => {
    const p = buildPerson(people.Q1316, context())!;
    expect(p).toMatchObject({
      wikidataId: "Q1316",
      slug: "saddam-hussein",
      birthYear: 1937,
      deathYear: 2006,
      birthDate: "1937-04-28",
      deathDate: "2006-12-30",
      sitelinks: 171,
    });
    expect(p.text.en.name).toBe("Saddam Hussein");
    expect(p.text.en.birthPlace).toBe("Al-Awja");
    expect(p.text.en.biography).toContain("Ba'ath Party");
    expect(p.text.en.source?.url).toBe("https://en.wikipedia.org/wiki/Saddam_Hussein");
    expect(p.text.ar?.name).toBe("صدام حسين");

    const kinds = p.life.map((l) => `${l.kind}:${l.startYear}:${l.label.en}`);
    expect(kinds[0]).toBe("birth:1937:Born in Al-Awja");
    expect(kinds.at(-1)).toBe("death:2006:Died in Camp Justice");
    expect(kinds).toContain("position:1979:President of Iraq");
    expect(kinds).toContain("conflict:1980:Iran–Iraq War");
    expect(kinds).toContain("conflict:1990:Gulf War");
    const war = p.life.find((l) => l.wikidataId === "Q82664")!;
    expect(war).toMatchObject({ endYear: 1988, label: { ar: "الحرب العراقية الإيرانية" } });
    // Items with no label are left out rather than shown as ids.
    expect(p.life.every((l) => !/^Q\d+$/.test(l.label.en))).toBe(true);
  });

  it("builds a living footballer's teams and caps awards", () => {
    const p = buildPerson(people.Q615, context())!;
    expect(p.deathYear).toBeNull();
    const teams = p.life.filter((l) => l.kind === "team").map((l) => l.label.en);
    expect(teams).toEqual(expect.arrayContaining(["FC Barcelona", "Paris Saint-Germain F.C."]));
    expect(p.life.filter((l) => l.kind === "award").length).toBeLessThanOrEqual(12);
    const keys = p.life.map((l) => `${l.kind}|${l.wikidataId}|${l.startYear}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("skips people without an English article or a birth year", () => {
    const rest = Object.fromEntries(Object.entries(people.Q615.sitelinks!).filter(([k]) => k !== "enwiki"));
    expect(buildPerson({ ...people.Q615, sitelinks: rest }, context())).toBeNull();
  });
});

describe("events", () => {
  const ctx = context({
    labels: new Map([["Q219060", { en: "State of Palestine", ar: "دولة فلسطين" }]]),
    leads: {
      en: new Map([
        [
          "First Intifada",
          lead("en", "First Intifada", "The First Intifada was a sustained series of Palestinian protests."),
        ],
      ]),
      ar: new Map(),
    },
    sitelinks: new Map([["Q49105", 60]]),
  });

  it("builds an event with dates, place, summary and Arabic title", () => {
    const e = buildEvent(event(), ctx)!;
    expect(e).toMatchObject({
      slug: "first-intifada",
      seedSlug: null,
      startYear: 1987,
      endYear: 1993,
      startDate: "1987-12-08",
      endDate: "1993-09-13",
      importance: 2,
    });
    expect(e.text.en).toMatchObject({ title: "First Intifada", placeLabel: "State of Palestine" });
    expect(e.text.en.summary).toContain("Palestinian protests");
    // No Arabic article: the Arabic summary falls back to nothing, so the row falls back to English.
    expect(e.text.ar).toBeNull();
  });

  it("keeps the seed slug for hand-written events", () => {
    const e = buildEvent(event(), { ...ctx, seeds: new Map([["Q49105", "first-intifada"]]) })!;
    expect(e.seedSlug).toBe("first-intifada");
  });

  it("drops undated and future events", () => {
    expect(buildEvent(event({ claims: {} }), ctx)).toBeNull();
    const future = event();
    future.claims!.P580[0].mainsnak.datavalue = {
      type: "time",
      value: { time: "+2100-01-01T00:00:00Z", precision: 9 },
    };
    delete future.claims!.P582;
    expect(buildEvent(future, ctx)).toBeNull();
  });

  it("gives clashing slugs a year", () => {
    const a = { slug: "siege-of-baghdad", wikidataId: "Q1", sitelinks: 50, startYear: 1258 };
    const b = { slug: "siege-of-baghdad", wikidataId: "Q2", sitelinks: 10, startYear: 1917 };
    expect(dedupeSlugs([a, b], (r) => r.startYear).map((r) => r.slug)).toEqual([
      "siege-of-baghdad",
      "siege-of-baghdad-1917",
    ]);
  });
});

describe("bundle", () => {
  it("validates what the builders produce", () => {
    const ctx = context();
    const ev = buildEvent(event(), {
      ...ctx,
      labels: new Map([["Q219060", { en: "State of Palestine", ar: null }]]),
      leads: { en: new Map([["First Intifada", lead("en", "First Intifada", "An uprising.")]]), ar: new Map() },
    })!;
    const topic = buildTopic(
      {
        slug: "israeli-palestinian-conflict",
        article: "Israeli–Palestinian conflict",
        sensitive: true,
        startYear: 1917,
        endYear: null,
        events: [],
        people: [],
      },
      {
        id: "Q151622",
        labels: { en: { value: "Israeli–Palestinian conflict" } },
        sitelinks: { enwiki: { title: "Israeli–Palestinian conflict" } },
      },
      [ev],
      ["Q1316"],
      ctx,
    )!;
    expect(topic).toMatchObject({ startYear: 1917, endYear: null, isSensitive: true, events: ["Q49105"] });
    const bundle = {
      generatedAt: "2026-10-17T00:00:00.000Z",
      images: [],
      events: [ev],
      people: [buildPerson(people.Q1316, ctx)!],
      topics: [topic],
      seedLinks: [{ slug: "first-intifada", wikidataId: "Q49105" }],
    };
    expect(() => BundleSchema.parse(bundle)).not.toThrow();
  });
});
