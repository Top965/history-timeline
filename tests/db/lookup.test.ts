/**
 * "Look up on Wikipedia" against the test database, with Wikimedia faked.
 * Cleans up after itself. Skipped without DATABASE_URL.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Entity } from "../../scripts/import/wikidata";
import { fakeWikimedia, fixturePeople } from "../support/wikimedia";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {}, revalidateTag }));

const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 2, onnotice: () => {} }) : null;

const NEW = "Q999999950";
const HIDDEN = "Q999999951";
const OTHER = "Q999999952";
const DOC = "Q999999953";
const DISAMBIG = "Q999999954";
const EVENT = "Q999999955";
const NO_ARTICLE = "Q999999956";

function person(id: string, name: string): Entity {
  const e = structuredClone(fixturePeople.Q1316);
  e.id = id;
  e.labels = { en: { value: name }, ar: { value: `${name} بالعربية` } };
  e.sitelinks = { enwiki: { title: name } };
  return e;
}
const entities = {
  [NEW]: person(NEW, "Testa Lookupson"),
  [HIDDEN]: person(HIDDEN, "Hidden Lookupson"),
  [OTHER]: person(OTHER, "Other Lookupson"),
};

describe.skipIf(!url)("look up anyone", () => {
  let lookup: typeof import("@/lib/people/lookup");

  beforeAll(async () => {
    lookup = await import("@/lib/people/lookup");
    await sql!`insert into people (wikidata_id, slug, birth_year, status)
      values (${HIDDEN}, 'hidden-lookupson', 1937, 'draft')`;
    await sql!`insert into events (wikidata_id, slug, start_year, importance, status, published_at)
      values (${EVENT}, 'battle-of-lookupson', 1900, 3, 'published', now())`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    revalidateTag.mockClear();
  });

  afterAll(async () => {
    await sql!`delete from person_requests where wikidata_id like 'Q99999995%' or client_hash like 'test-%'`;
    await sql!`delete from people where wikidata_id like 'Q99999995%'`;
    await sql!`delete from events where wikidata_id like 'Q99999995%'`;
    await sql?.end();
  });

  it("offers only people who aren't on the site yet", async () => {
    fakeWikimedia(entities, [
      { id: NEW, label: "Testa Lookupson", description: "test person" },
      { id: HIDDEN, label: "Hidden Lookupson" },
      { id: "Q404", label: "Not on Wikidata" },
    ]);
    expect(await lookup.findCandidates("en", "lookupson")).toEqual([
      { wikidataId: NEW, name: "Testa Lookupson", description: "test person", kind: "person" },
    ]);
  });

  it("also offers other articles to read, and events the site has under another name", async () => {
    const thing = (id: string, type: string, sitelinks: Entity["sitelinks"]): Entity => ({
      id,
      claims: {
        P31: [
          {
            mainsnak: {
              snaktype: "value",
              property: "P31",
              datavalue: { type: "wikibase-entityid", value: { id: type } },
            },
            rank: "normal",
          },
        ],
      },
      sitelinks,
    });
    fakeWikimedia(
      {
        [DOC]: thing(DOC, "Q49848", { arwiki: { title: "وثيقة" } }),
        [DISAMBIG]: thing(DISAMBIG, "Q4167410", { enwiki: { title: "Lookupson (disambiguation)" } }),
        [EVENT]: thing(EVENT, "Q178561", { enwiki: { title: "Battle of Lookupson" } }),
        [NO_ARTICLE]: thing(NO_ARTICLE, "Q49848", { frwiki: { title: "Document" } }),
      },
      [
        { id: DOC, label: "وثيقة", description: "document" },
        { id: DISAMBIG, label: "Lookupson" },
        { id: EVENT, label: "معركة" },
        { id: NO_ARTICLE, label: "Document" },
      ],
    );
    expect(await lookup.findCandidates("ar", "lookupson")).toEqual([
      { wikidataId: DOC, name: "وثيقة", description: "document", kind: "article" },
      { wikidataId: EVENT, name: "معركة", description: null, kind: "event", slug: "battle-of-lookupson" },
    ]);
  });

  it("adds a person once, then finds them", async () => {
    fakeWikimedia(entities);
    expect(await lookup.addPerson(NEW, "test-a")).toEqual({ ok: true, slug: "testa-lookupson", created: true });
    expect(revalidateTag).toHaveBeenCalledWith("search", "max");

    const [row] = await sql!`
      select p.added_via::text, p.status::text, t.name from people p
      join person_translations t on t.person_id = p.id and t.locale = 'en' where p.wikidata_id = ${NEW}`;
    expect(row).toEqual({ added_via: "search", status: "published", name: "Testa Lookupson" });

    const queries = await import("@/lib/db/queries");
    const page = await queries.getPersonPage("en", "testa-lookupson");
    expect(page?.person).toMatchObject({ wikidataId: NEW, addedFromSearch: true });
    expect(page?.person.notes).toEqual(expect.any(Array));

    expect(await lookup.addPerson(NEW, "test-b")).toEqual({ ok: true, slug: "testa-lookupson", created: false });
    const [{ n }] = await sql!`select count(*)::int as n from person_requests where wikidata_id = ${NEW}`;
    expect(n).toBe(1);
  });

  it("keeps a hidden person hidden", async () => {
    fakeWikimedia(entities);
    expect(await lookup.addPerson(HIDDEN, "test-a")).toEqual({ ok: false, reason: "not-found" });
    const [row] = await sql!`select status::text from people where wikidata_id = ${HIDDEN}`;
    expect(row.status).toBe("draft");
  });

  it("limits how many people one visitor can add", async () => {
    fakeWikimedia(entities);
    await sql!`insert into person_requests (client_hash, wikidata_id)
      select 'test-busy', 'Q1' from generate_series(1, ${lookup.LIMITS.perClientPerHour})`;
    expect(await lookup.addPerson(OTHER, "test-busy")).toEqual({ ok: false, reason: "rate-limited" });
    const found = await sql!`select 1 from people where wikidata_id = ${OTHER}`;
    expect(found).toHaveLength(0);
  });

  it("keeps the request log private", async () => {
    await expect(
      sql!.begin(async (tx) => {
        await tx`set local role anon`;
        await tx`select * from person_requests`;
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
