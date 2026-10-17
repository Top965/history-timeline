/**
 * One person, fetched on demand: the same steps as the weekly import
 * (fetch.ts) for a single Wikidata item, for "look up anyone" in search.
 */
import { buildPerson, isHuman, lifeReferences, lifeSpanReferences, type BuildContext } from "./build";
import { commonsTitle, getImages } from "./commons";
import { labelsFor, leadsFor, sitelinkCounts, USED_CLAIMS, yearSpans } from "./fetch";
import type { Http } from "./http";
import { BundleSchema, type Bundle } from "./model";
import { claims, firstTime, getEntities } from "./wikidata";

export type PersonFetchResult =
  | { ok: true; bundle: Bundle }
  | { ok: false; reason: "not-found" | "not-a-person" | "no-article" | "no-birth-year" | "unreliable-dates" };

/**
 * Builds a one-person bundle for `loadBundle`.
 * `siteEvents` are the Wikidata ids of events on the site, so the life timeline links to them.
 */
export async function fetchPerson(
  http: Http,
  wikidataId: string,
  siteEvents: ReadonlySet<string>,
  now = new Date(),
): Promise<PersonFetchResult> {
  const props = ["labels", "descriptions", "aliases", "claims", "sitelinks"];
  const entity = (await getEntities(http, [wikidataId], props, undefined, USED_CLAIMS)).get(wikidataId);
  if (!entity) return { ok: false, reason: "not-found" };
  if (!isHuman(entity)) return { ok: false, reason: "not-a-person" };
  if (!entity.sitelinks?.enwiki?.title) return { ok: false, reason: "no-article" };

  const imageNames = claims(entity, "P18").flatMap((c) =>
    c.mainsnak.datavalue?.type === "string" ? [c.mainsnak.datavalue.value as string] : [],
  );
  const [labels, spans, leads, sitelinks, images] = await Promise.all([
    labelsFor(http, [...new Set(lifeReferences(entity))]),
    yearSpans(http, [...new Set(lifeSpanReferences(entity))]),
    leadsFor(http, [entity]),
    sitelinkCounts(http, [wikidataId]),
    getImages(http, imageNames.slice(0, 1)),
  ]);
  const ctx: BuildContext = {
    labels,
    leads,
    images,
    spans,
    sitelinks,
    seeds: new Map(),
    siteEvents: new Set(siteEvents),
    currentYear: now.getUTCFullYear(),
  };
  const person = buildPerson(entity, ctx);
  if (!person) {
    const birth = firstTime(entity, "P569");
    if (!birth) return { ok: false, reason: "no-birth-year" };
    return { ok: false, reason: "unreliable-dates" };
  }

  return {
    ok: true,
    bundle: BundleSchema.parse({
      generatedAt: now.toISOString(),
      images: [...images.values()].filter((i) => commonsTitle(i.commonsFile) === person.image),
      events: [],
      people: [person],
      topics: [],
      seedLinks: [],
    }),
  };
}
