import "server-only";
import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { Http } from "../../../scripts/import/http";
import { loadBundle } from "../../../scripts/import/load";
import { fetchPerson } from "../../../scripts/import/person";
import { claims, getEntities, itemId, searchEntities } from "../../../scripts/import/wikidata";
import { publicRead, serverWrite } from "@/lib/db/client";
import { CACHE_TAGS } from "@/lib/db/queries";
import { serverEnv } from "@/lib/env";
import type { Locale } from "@/lib/i18n/config";
import { logger } from "@/lib/log/logger";
import type { Candidate } from "./types";

/**
 * "Look up anyone": find people on Wikidata who aren't on the site yet, and add
 * one on request with the same steps as the weekly import.
 */

/** New people one visitor may add per hour, and the whole site per day. */
export const LIMITS = { perClientPerHour: 10, sitePerDay: 300 } as const;

export type { Candidate };

export type AddResult =
  | { ok: true; slug: string; created: boolean }
  | { ok: false; reason: "rate-limited" | "not-found" | "not-a-person" | "no-article" | "no-birth-year" };

// One HTTP client per server instance: polite concurrency, no disk cache.
const http = new Http({ cacheDir: null, concurrency: 4, retries: 2 });

/** A salted hash of the visitor's address, so limits work without storing the address. */
export function clientHash(ip: string): string {
  const salt = createHash("sha256").update(serverEnv().DATABASE_URL).digest("hex");
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** People matching `query` on Wikidata that have an English Wikipedia article and aren't on the site. */
export async function findCandidates(locale: Locale, query: string, limit = 5): Promise<Candidate[]> {
  const hits = await searchEntities(http, query, locale, 10);
  if (!hits.length) return [];
  const entities = await getEntities(
    http,
    hits.map((h) => h.id),
    ["claims", "sitelinks"],
    [locale],
    ["P31"],
  );
  const people = hits.filter((h) => {
    const e = entities.get(h.id);
    return e && e.sitelinks?.enwiki && claims(e, "P31").some((c) => itemId(c.mainsnak) === "Q5");
  });
  if (!people.length) return [];
  // Every status counts: someone hidden after review must not be offered again.
  const known = await serverWrite(
    "people.known",
    (sql) => sql<{ wikidata_id: string }[]>`
      select wikidata_id from public.people where wikidata_id = any(${people.map((p) => p.id)}::text[])`,
  );
  const onSite = new Set(known.map((r) => r.wikidata_id));
  return people
    .filter((p) => !onSite.has(p.id))
    .slice(0, limit)
    .map((p) => ({ wikidataId: p.id, name: p.label ?? p.id, description: p.description }));
}

/** Adds one person from Wikidata (or finds them if already there) and returns their page. */
export async function addPerson(wikidataId: string, client: string): Promise<AddResult> {
  const log = logger.child({ kind: "people_lookup", wikidataId, client });

  const [existing] = await serverWrite(
    "people.find",
    (sql) => sql<{ slug: string; status: string }[]>`
      select slug, status::text from public.people where wikidata_id = ${wikidataId}`,
  );
  if (existing?.status === "published") return { ok: true, slug: existing.slug, created: false };
  // A hidden person stays hidden: adding them again must not undo a review.
  if (existing) return { ok: false, reason: "not-found" };

  const [counts] = await serverWrite(
    "people.requests.count",
    (sql) => sql<{ mine: number; site: number }[]>`
      select
        (select count(*)::int from public.person_requests
          where client_hash = ${client} and created_at > now() - interval '1 hour') as mine,
        (select count(*)::int from public.person_requests where created_at > now() - interval '1 day') as site`,
  );
  if (counts.mine >= LIMITS.perClientPerHour || counts.site >= LIMITS.sitePerDay) {
    log.warn({ ...counts }, "lookup refused: rate limit");
    return { ok: false, reason: "rate-limited" };
  }

  const siteEvents = await publicRead(
    "events.wikidata_ids",
    (tx) => tx<{ wikidata_id: string }[]>`
      select wikidata_id from public.events where wikidata_id is not null and status = 'published'`,
  );
  const fetched = await fetchPerson(http, wikidataId, new Set(siteEvents.map((r) => r.wikidata_id)));
  if (!fetched.ok) {
    log.info({ reason: fetched.reason }, "lookup found nothing to add");
    return fetched;
  }
  const slug = await serverWrite("people.add", async (sql) => {
    await loadBundle(sql, fetched.bundle);
    const [person] = await sql<{ id: string; slug: string }[]>`
      update public.people set added_via = 'search' where wikidata_id = ${wikidataId} returning id, slug`;
    await sql`insert into public.person_requests (client_hash, wikidata_id, person_id)
      values (${client}, ${wikidataId}, ${person.id})`;
    return person.slug;
  });

  // Search catches up in the background; the new page must show at once.
  revalidateTag(CACHE_TAGS.search, "max");
  revalidateTag(CACHE_TAGS.person(slug), { expire: 0 });
  log.info({ slug }, "person added from search");
  return { ok: true, slug, created: true };
}
