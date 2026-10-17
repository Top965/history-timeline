import { afterEach, describe, expect, it, vi } from "vitest";
import { Http } from "../../scripts/import/http";
import { fetchPerson } from "../../scripts/import/person";
import { fakeWikimedia, fixturePeople } from "../support/wikimedia";

const http = () => new Http({ cacheDir: null, retries: 0 });
const now = new Date("2026-10-17T00:00:00Z");

afterEach(() => vi.unstubAllGlobals());

describe("fetchPerson", () => {
  it("builds a one-person bundle the loader accepts", async () => {
    fakeWikimedia(fixturePeople);
    const result = await fetchPerson(http(), "Q1316", new Set(), now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { people, events, topics } = result.bundle;
    expect(events).toEqual([]);
    expect(topics).toEqual([]);
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ wikidataId: "Q1316", slug: "saddam-hussein", birthYear: 1937, deathYear: 2006 });
    expect(people[0].text.en.biography).toContain("Saddam Hussein is a test person.");
    expect(people[0].text.ar?.name).toBeTruthy();
    // Every life event is a dated Wikidata statement; none is made up.
    expect(people[0].life.every((l) => l.startYear >= 1937 && l.startYear <= 2006)).toBe(true);
    expect(people[0].notes).not.toContain("no-biography");
  });

  it("refuses anything that isn't a person with a Wikipedia article", async () => {
    const city = structuredClone(fixturePeople.Q1316);
    city.id = "Q1";
    city.claims!.P31 = [];
    const noArticle = structuredClone(fixturePeople.Q1316);
    noArticle.id = "Q2";
    noArticle.sitelinks = {};
    const noBirth = structuredClone(fixturePeople.Q1316);
    noBirth.id = "Q3";
    delete noBirth.claims!.P569;
    const tooOld = structuredClone(fixturePeople.Q1316);
    tooOld.id = "Q4";
    delete tooOld.claims!.P570;
    tooOld.claims!.P569[0].mainsnak.datavalue = {
      type: "time",
      value: { time: "+1800-01-01T00:00:00Z", precision: 9 },
    };
    fakeWikimedia({ Q1: city, Q2: noArticle, Q3: noBirth, Q4: tooOld });

    expect(await fetchPerson(http(), "Q404", new Set(), now)).toEqual({ ok: false, reason: "not-found" });
    expect(await fetchPerson(http(), "Q1", new Set(), now)).toEqual({ ok: false, reason: "not-a-person" });
    expect(await fetchPerson(http(), "Q2", new Set(), now)).toEqual({ ok: false, reason: "no-article" });
    expect(await fetchPerson(http(), "Q3", new Set(), now)).toEqual({ ok: false, reason: "no-birth-year" });
    // Born in 1800 with no death recorded would be 226 years old: not a timeline we can trust.
    expect(await fetchPerson(http(), "Q4", new Set(), now)).toEqual({ ok: false, reason: "unreliable-dates" });
  });
});
