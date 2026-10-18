import { describe, expect, it } from "vitest";
import type { BuildContext } from "../../scripts/import/build";
import {
  buildGroup,
  currentCountry,
  groupKind,
  groupLinks,
  isSourced,
  MAX_GROUP_PEOPLE,
} from "../../scripts/import/groups";
import { TopicSchema, type ImportEvent } from "../../scripts/import/model";
import type { Claim, Entity } from "../../scripts/import/wikidata";

const item = (property: string, id: string, extra: Partial<Claim> = {}): Claim => ({
  rank: "normal",
  mainsnak: { snaktype: "value", property, datavalue: { type: "wikibase-entityid", value: { id } } },
  ...extra,
});
const time = (property: string, t: string): Claim => ({
  rank: "normal",
  mainsnak: { snaktype: "value", property, datavalue: { type: "time", value: { time: t, precision: 9 } } },
});
const text = (property: string, value: string, language: string): Claim => ({
  rank: "normal",
  mainsnak: { snaktype: "value", property, datavalue: { type: "monolingualtext", value: { text: value, language } } },
});
const cited = { references: [{ snaks: { P248: [] } }] };
const fromWikipedia = { references: [{ snaks: { P143: [], P813: [] } }] };

function ctx(): BuildContext {
  return {
    labels: new Map(),
    leads: {
      en: new Map([
        [
          "Egypt",
          { title: "Egypt", url: "https://en.wikipedia.org/wiki/Egypt", revisionId: 7, extract: "Egypt is a country." },
        ],
      ]),
      ar: new Map(),
    },
    images: new Map(),
    spans: new Map(),
    sitelinks: new Map(),
    seeds: new Map(),
    siteEvents: new Set(),
    currentYear: 2026,
  };
}

const ev = (wikidataId: string, startYear: number, importance: 1 | 2 | 3 = 3): ImportEvent => ({
  wikidataId,
  slug: wikidataId.toLowerCase(),
  seedSlug: null,
  startYear,
  endYear: null,
  startDate: null,
  endDate: null,
  isApproximate: false,
  importance,
  sitelinks: 20,
  latitude: null,
  longitude: null,
  image: null,
  text: { en: { title: wikidataId, summary: "x.", placeLabel: "x", keywords: [], source: null }, ar: null },
});

describe("countries, people groups and religions", () => {
  it("finds the country a place is in today, skipping countries that ended", () => {
    const alexandria: Entity = {
      id: "Q87",
      claims: {
        P17: [
          item("P17", "Q12560", { qualifiers: { P582: [time("P582", "+1914-00-00T00:00:00Z").mainsnak] } }),
          item("P17", "Q79"),
        ],
      },
    };
    expect(currentCountry(alexandria)).toBe("Q79");
    expect(currentCountry({ id: "Q1" })).toBeNull();
  });

  it("only counts real references as a source", () => {
    expect(isSourced(item("P140", "Q432", cited))).toBe(true);
    expect(isSourced(item("P140", "Q432", fromWikipedia))).toBe(false);
    expect(isSourced(item("P140", "Q432"))).toBe(false);
  });

  it("links events and people, and records the statement behind each link", () => {
    const battle: Entity = {
      id: "Q100",
      claims: { P17: [item("P17", "Q12560")], P276: [item("P276", "Q87")], P140: [item("P140", "Q432")] },
    };
    const historical: Entity = {
      id: "Q200",
      claims: {
        P570: [time("P570", "+1900-00-00T00:00:00Z")],
        P27: [item("P27", "Q79")],
        P19: [item("P19", "Q87")],
        P140: [item("P140", "Q432")],
        P172: [item("P172", "Q35323")],
      },
    };
    // Living people: religion and ethnic group only with a cited source.
    const living: Entity = {
      id: "Q300",
      claims: { P140: [item("P140", "Q432", fromWikipedia)], P172: [item("P172", "Q35323", cited)] },
    };
    const links = groupLinks([battle], [historical, living], new Map([["Q87", "Q79"]]));
    expect(links).toEqual([
      { group: "Q12560", hint: "country", member: "Q100", type: "event", via: "P17" },
      { group: "Q79", hint: "country", member: "Q100", type: "event", via: "P276>P17" },
      { group: "Q432", hint: "religion", member: "Q100", type: "event", via: "P140" },
      { group: "Q79", hint: "country", member: "Q200", type: "person", via: "P27" },
      { group: "Q432", hint: "religion", member: "Q200", type: "person", via: "P140" },
      { group: "Q35323", hint: "people", member: "Q200", type: "person", via: "P172" },
      { group: "Q35323", hint: "people", member: "Q300", type: "person", via: "P172" },
    ]);
  });

  it("tells countries, former states, people groups and religions apart", () => {
    const country = new Set(["country"] as const);
    expect(groupKind({ id: "Q79", claims: { P31: [item("P31", "Q3624078")] } }, country)).toBe("country");
    expect(
      groupKind(
        { id: "Q12560", claims: { P31: [item("P31", "Q3624078")], P576: [time("P576", "+1922-00-00T00:00:00Z")] } },
        country,
      ),
    ).toBe("former_country");
    expect(groupKind({ id: "Q2", claims: { P31: [item("P31", "Q3024240")] } }, country)).toBe("former_country");
    // A city or region named as a "country" by mistake gets no page.
    expect(groupKind({ id: "Q87", claims: { P31: [item("P31", "Q515")] } }, country)).toBeNull();
    expect(groupKind({ id: "Q432" }, new Set(["religion"] as const))).toBe("religion");
    expect(groupKind({ id: "Q35323" }, new Set(["people"] as const))).toBe("people");
  });

  it("builds a country page that covers all its history and answers to other names", () => {
    const egypt: Entity = {
      id: "Q79",
      labels: { en: { value: "Egypt" }, ar: { value: "مصر" } },
      aliases: { en: [{ value: "Arab Republic of Egypt" }] },
      sitelinks: { enwiki: { title: "Egypt" } },
      claims: {
        P571: [time("P571", "+1922-00-00T00:00:00Z")],
        P1549: [text("P1549", "Egyptian", "en"), text("P1549", "مصري", "ar"), text("P1549", "égyptien", "fr")],
      },
    };
    const people = Array.from({ length: MAX_GROUP_PEOPLE + 5 }, (_, i) => ({
      wikidataId: `Q${9000 + i}`,
      birthYear: 1900,
    }));
    const group = buildGroup(
      egypt,
      "country",
      [ev("Q11", 1956), ev("Q10", -1274, 1)],
      people,
      { Q10: "P276>P17", Q11: "P17", Q9000: "P27", [`Q${9000 + MAX_GROUP_PEOPLE + 1}`]: "P27" },
      ctx(),
    )!;
    expect(TopicSchema.parse(group)).toEqual(group);
    expect(group).toMatchObject({ slug: "egypt", kind: "country", startYear: -1274, endYear: null });
    expect(group.events).toEqual(["Q10", "Q11"]);
    expect(group.people).toHaveLength(MAX_GROUP_PEOPLE);
    // Sources are kept only for members that are listed.
    expect(group.via).toEqual({ Q10: "P276>P17", Q11: "P17", Q9000: "P27" });
    expect(group.text.en).toMatchObject({ name: "Egypt", summary: "Egypt is a country." });
    expect(group.text.en.keywords).toEqual(expect.arrayContaining(["egypt", "arab republic of egypt", "egyptian"]));
    expect(group.text.ar?.keywords).toEqual(["مصر", "مصري"]);
  });

  it("ends a former state's page when it ended", () => {
    const ottoman: Entity = {
      id: "Q12560",
      labels: { en: { value: "Ottoman Empire" } },
      claims: { P571: [time("P571", "+1299-00-00T00:00:00Z")], P576: [time("P576", "+1922-00-00T00:00:00Z")] },
    };
    const group = buildGroup(ottoman, "former_country", [ev("Q1", 1453)], [], {}, ctx())!;
    expect(group).toMatchObject({ slug: "ottoman-empire", startYear: 1299, endYear: 1922 });
  });
});
