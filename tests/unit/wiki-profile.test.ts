import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWikiProfile } from "@/lib/wiki/fetchProfile";
import {
  articleLead,
  careerRows,
  keyDates,
  parseArticle,
  parseHonours,
  profileFacts,
  readableSections,
  type Claim,
  type Labels,
  type WikidataEntity,
} from "@/lib/wiki/profile";

afterEach(() => vi.unstubAllGlobals());

const item = (id: string) => ({ snaktype: "value", datavalue: { value: { id } } });
const time = (year: number) => ({ snaktype: "value", datavalue: { value: { time: `+${year}-01-01T00:00:00Z` } } });
const amount = (n: number, unit = "1") => ({
  snaktype: "value",
  datavalue: { value: { amount: `+${n}`, unit } },
});
const team = (id: string, from: number, to: number | null, apps?: number, goals?: number, number?: string): Claim => ({
  mainsnak: item(id),
  qualifiers: {
    P580: [time(from)],
    ...(to ? { P582: [time(to)] } : {}),
    ...(apps != null ? { P1350: [amount(apps)] } : {}),
    ...(goals != null ? { P1351: [amount(goals)] } : {}),
    ...(number ? { P1618: [{ snaktype: "value", datavalue: { value: number } }] } : {}),
  },
});

const neymar: WikidataEntity = {
  id: "Q142794",
  claims: {
    P1477: [{ mainsnak: { snaktype: "value", datavalue: { value: { text: "Neymar da Silva Santos Júnior" } } } }],
    P2048: [{ mainsnak: amount(1.75, "http://www.wikidata.org/entity/Q11573") }],
    P413: [{ mainsnak: item("Q1") }, { mainsnak: item("Q2") }],
    P106: [{ mainsnak: item("Q3") }],
    P54: [team("Q10", 2013, 2017, 123, 68), team("Q11", 2009, 2013, 179, 107), team("Q12", 2025, null, 42, 19, "10")],
  },
  sitelinks: { enwiki: { title: "Neymar" }, arwiki: { title: "نيمار" } },
};
const labels: Labels = new Map([
  ["Q1", { en: "attacking midfielder", ar: "وسط مهاجم" }],
  ["Q2", { en: "forward" }],
  ["Q3", { en: "association football player", ar: "لاعب كرة قدم" }],
  ["Q10", { en: "FC Barcelona", ar: "نادي برشلونة" }],
  ["Q11", { en: "Santos FC", ar: "نادي سانتوس" }],
  ["Q12", { en: "Santos FC", ar: "نادي سانتوس" }],
]);

describe("profileFacts", () => {
  it("reads the profile box from Wikidata, in the reader's language where labelled", () => {
    expect(profileFacts(neymar, labels, "en")).toEqual([
      { key: "fullName", value: "Neymar da Silva Santos Júnior" },
      { key: "height", value: "1.75 m" },
      { key: "positions", value: "attacking midfielder · forward" },
      { key: "occupation", value: "association football player" },
      { key: "currentTeam", value: "Santos FC" },
      { key: "number", value: "10" },
    ]);
    const ar = profileFacts(neymar, labels, "ar");
    expect(ar.find((f) => f.key === "positions")?.value).toBe("وسط مهاجم · forward");
    expect(ar.find((f) => f.key === "currentTeam")?.value).toBe("نادي سانتوس");
  });

  it("leaves out what the entry does not say", () => {
    expect(profileFacts({ id: "Q9", claims: {} }, labels, "en")).toEqual([]);
  });

  it("rejects heights that cannot be right", () => {
    const tall = { id: "Q9", claims: { P2048: [{ mainsnak: amount(175, "http://www.wikidata.org/entity/Q11573") }] } };
    expect(profileFacts(tall, labels, "en")).toEqual([]);
  });
});

describe("careerRows", () => {
  it("lists teams in order with appearances and goals", () => {
    expect(careerRows(neymar, labels, "en")).toEqual([
      { team: "Santos FC", startYear: 2009, endYear: 2013, apps: 179, goals: 107 },
      { team: "FC Barcelona", startYear: 2013, endYear: 2017, apps: 123, goals: 68 },
      { team: "Santos FC", startYear: 2025, endYear: null, apps: 42, goals: 19 },
    ]);
  });
});

const article = `Neymar is a Brazilian footballer.


== Early life ==
Born in Mogi das Cruzes.


== Club career ==

=== Santos ===
He debuted in 2009.


== Honours ==

=== Club ===

==== Santos ====
Campeonato Paulista: 2010, 2011, 2012
Copa Libertadores: 2011

==== Barcelona ====
La Liga: 2014–15, 2015–16
Some trophy with no year


=== International ===
Brazil
Olympic Gold Medal: 2016


== References ==
Ref 1`;

describe("parseArticle and readableSections", () => {
  it("splits the article into sections a reader can open, without the lead or reference lists", () => {
    const sections = readableSections(parseArticle(article));
    expect(sections.map((s) => s.title)).toEqual(["Early life", "Club career"]);
    expect(sections[1].body).toBe("## Santos\n\nHe debuted in 2009.");
  });
});

describe("parseHonours", () => {
  it("groups honours under their headings and keeps only those with a year", () => {
    expect(parseHonours(parseArticle(article))).toEqual([
      {
        group: "Santos",
        items: [
          { title: "Campeonato Paulista", years: "2010, 2011, 2012" },
          { title: "Copa Libertadores", years: "2011" },
        ],
      },
      { group: "Barcelona", items: [{ title: "La Liga", years: "2014–15, 2015–16" }] },
      { group: "Brazil", items: [{ title: "Olympic Gold Medal", years: "2016" }] },
    ]);
  });

  it("finds an Arabic honours section", () => {
    const ar = "مقدمة\n\n== الإنجازات ==\nكأس العالم: 2002\n\n== المراجع ==\n";
    expect(parseHonours(parseArticle(ar))).toEqual([{ group: null, items: [{ title: "كأس العالم", years: "2002" }] }]);
  });

  it("returns nothing when the article has no honours", () => {
    expect(parseHonours(parseArticle("Intro\n\n== Early life ==\nText"))).toEqual([]);
  });
});

describe("keyDates and articleLead", () => {
  it("reads when something happened or was published, and nothing else", () => {
    const protocols: WikidataEntity = {
      id: "Q193286",
      claims: { P577: [{ mainsnak: time(1903) }], P571: [{ mainsnak: { snaktype: "somevalue" } }] },
    };
    expect(keyDates(protocols)).toEqual([{ key: "published", year: 1903 }]);
    const war: WikidataEntity = {
      id: "Q1",
      claims: { P580: [{ mainsnak: time(1990) }], P582: [{ mainsnak: time(1991) }] },
    };
    expect(keyDates(war)).toEqual([
      { key: "start", year: 1990 },
      { key: "end", year: 1991 },
    ]);
  });

  it("takes the lead from before the first heading", () => {
    expect(articleLead(article)).toBe("Neymar is a Brazilian footballer.");
    expect(articleLead("Only a lead.")).toBe("Only a lead.");
  });
});

describe("loadWikiProfile", () => {
  it("reads the article in the reader's language when it exists", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        const url = new URL(input);
        urls.push(url.toString());
        const p = url.searchParams;
        const body =
          url.host === "www.wikidata.org" && p.get("props") === "claims|sitelinks|labels|descriptions"
            ? { entities: { Q142794: neymar } }
            : url.host === "www.wikidata.org"
              ? {
                  entities: Object.fromEntries([...labels].map(([id, l]) => [id, { labels: { en: { value: l.en } } }])),
                }
              : { query: { pages: [{ extract: article }] } };
        return new Response(JSON.stringify(body));
      }),
    );
    const profile = await loadWikiProfile("Q142794", "ar");
    expect(profile.article).toEqual({ lang: "ar", title: "نيمار", url: expect.stringContaining("ar.wikipedia.org") });
    expect(urls.some((u) => u.startsWith("https://ar.wikipedia.org/") && u.includes("origin=*"))).toBe(true);
    expect(profile.career).toHaveLength(3);
    expect(profile.honours).toHaveLength(3);
    expect(profile.lead).toBe("Neymar is a Brazilian footballer.");
    expect(profile.title).toBe("نيمار");
  });

  it("fails when Wikidata cannot be reached, and tries again next time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    await expect(loadWikiProfile("Q1", "en")).rejects.toThrow("HTTP 503");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ entities: {} }))),
    );
    await expect(loadWikiProfile("Q1", "en")).rejects.toThrow("No Wikidata entry");
  });
});
