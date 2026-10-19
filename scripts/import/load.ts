/**
 * The load stage: writes a bundle into the database in one transaction.
 *
 * Safe to re-run. Rows are matched by Wikidata id (events, people) or slug
 * (topics). Hand-written text (origin = 'manual') is never changed, and the
 * dates and importance of hand-written seed events are kept too. Existing URLs
 * (slugs) never change.
 */
import type postgres from "postgres";
import { logExternalCall } from "@/lib/log/logger";
import type { Bundle, ImportSource, Locale } from "./model";

type Sql = postgres.Sql | postgres.TransactionSql;
type Json = postgres.JSONValue;

const LICENSE = "CC BY-SA 4.0";
const json = (sql: Sql, rows: unknown) => sql.json(rows as Json);

export type LoadResult = {
  images: number;
  events: number;
  eventTexts: number;
  people: number;
  lifeEvents: number;
  topics: number;
  topicEvents: number;
};

/** Picks a slug that is free, or already belongs to this item. */
function freeSlug(wanted: string, wikidataId: string, owners: Map<string, string | null>): string {
  for (const s of [wanted, `${wanted}-${wikidataId.toLowerCase()}`]) {
    const owner = owners.get(s);
    if (owner === undefined || owner === wikidataId) {
      owners.set(s, wikidataId);
      return s;
    }
  }
  throw new Error(`No free slug for ${wikidataId} (${wanted})`);
}

async function upsertSources(sql: Sql, sources: (ImportSource & { locale: Locale })[], retrievedAt: string) {
  const unique = new Map(sources.map((s) => [`${s.url}|${s.revisionId}`, s]));
  const rows = [...unique.values()].filter((s) => s.revisionId != null);
  const ids = new Map<string, string>();
  if (!rows.length) return ids;
  const out = await sql<{ id: string; url: string; revision_id: string }[]>`
    insert into public.sources (kind, url, title, locale, license, revision_id, retrieved_at)
    select 'wikipedia', r.url, r.title, r.locale, ${LICENSE}, r."revisionId", ${retrievedAt}::timestamptz
    from jsonb_to_recordset(${json(sql, rows)}::jsonb) as r(url text, title text, locale text, "revisionId" bigint)
    on conflict (url, revision_id) do update set retrieved_at = excluded.retrieved_at
    returning id, url, revision_id`;
  for (const r of out) ids.set(`${r.url}|${r.revision_id}`, r.id);
  return ids;
}

const sourceKey = (s: ImportSource | null) => (s && s.revisionId != null ? `${s.url}|${s.revisionId}` : null);

export async function loadBundle(sql: postgres.Sql, bundle: Bundle): Promise<LoadResult> {
  return logExternalCall(
    { service: "database", operation: "import.load" },
    () => sql.begin((tx) => loadInTransaction(tx, bundle)) as Promise<LoadResult>,
    (r) => r,
  );
}

async function loadInTransaction(tx: postgres.TransactionSql, bundle: Bundle): Promise<LoadResult> {
  const now = bundle.generatedAt;
  await tx`set local statement_timeout = '5min'`;

  // 1. Link hand-written seed events to Wikidata (once; never moves an id that is already in use).
  await tx`
    update public.events e set wikidata_id = r."wikidataId"
    from jsonb_to_recordset(${json(tx, bundle.seedLinks)}::jsonb) as r(slug text, "wikidataId" text)
    where e.slug = r.slug and e.wikidata_id is null
      and not exists (select 1 from public.events x where x.wikidata_id = r."wikidataId")`;

  // 2. Photos.
  const imageRows = await tx<{ id: string; commons_file: string }[]>`
    insert into public.images (commons_file, file_page_url, original_url, width, height, mime_type,
      license_short_name, license_url, author_text, author_url, credit_text, attribution_required, is_free, retrieved_at)
    select r."commonsFile", r."filePageUrl", r."originalUrl", r.width, r.height, r."mimeType",
      r."licenseShortName", r."licenseUrl", r."authorText", r."authorUrl", r."creditText", r."attributionRequired", true,
      ${now}::timestamptz
    from jsonb_to_recordset(${json(tx, bundle.images)}::jsonb) as r("commonsFile" text, "filePageUrl" text,
      "originalUrl" text, width int, height int, "mimeType" text, "licenseShortName" text, "licenseUrl" text,
      "authorText" text, "authorUrl" text, "creditText" text, "attributionRequired" boolean)
    on conflict (commons_file) do update set
      file_page_url = excluded.file_page_url, original_url = excluded.original_url, width = excluded.width,
      height = excluded.height, mime_type = excluded.mime_type, license_short_name = excluded.license_short_name,
      license_url = excluded.license_url, author_text = excluded.author_text, author_url = excluded.author_url,
      credit_text = excluded.credit_text, attribution_required = excluded.attribution_required,
      retrieved_at = excluded.retrieved_at
    returning id, commons_file`;
  const imageId = new Map(imageRows.map((r) => [r.commons_file, r.id]));

  // 3. Wikipedia articles the text comes from.
  const sources = await upsertSources(
    tx,
    [
      ...bundle.events.flatMap((e) =>
        (["en", "ar"] as const).flatMap((l) => (e.text[l]?.source ? [{ ...e.text[l]!.source!, locale: l }] : [])),
      ),
      ...bundle.people.flatMap((p) =>
        (["en", "ar"] as const).flatMap((l) => (p.text[l]?.source ? [{ ...p.text[l]!.source!, locale: l }] : [])),
      ),
      ...bundle.topics.flatMap((t) =>
        (["en", "ar"] as const).flatMap((l) => (t.text[l]?.source ? [{ ...t.text[l]!.source!, locale: l }] : [])),
      ),
    ],
    now,
  );
  const sourceId = (s: ImportSource | null) => (sourceKey(s) ? (sources.get(sourceKey(s)!) ?? null) : null);

  // 4. Events. Hand-written events (English text written by us) keep their dates and importance.
  const existing = await tx<{ slug: string; wikidata_id: string | null; manual: boolean }[]>`
    select e.slug, e.wikidata_id,
      exists (select 1 from public.event_translations t where t.event_id = e.id and t.origin = 'manual') as manual
    from public.events e`;
  const slugOwner = new Map(existing.map((r) => [r.slug, r.wikidata_id]));
  const manual = new Set(existing.filter((r) => r.manual && r.wikidata_id).map((r) => r.wikidata_id!));
  const slugByQid = new Map(existing.filter((r) => r.wikidata_id).map((r) => [r.wikidata_id!, r.slug]));

  const imported = bundle.events.filter((e) => !manual.has(e.wikidataId));
  const eventRows = imported.map((e) => ({
    ...e,
    slug: slugByQid.get(e.wikidataId) ?? freeSlug(e.slug, e.wikidataId, slugOwner),
  }));
  await tx`
    insert into public.events (slug, wikidata_id, start_year, end_year, start_date, end_date, is_approximate,
      importance, latitude, longitude, sitelinks, status, published_at)
    select r.slug, r."wikidataId", r."startYear", r."endYear", r."startDate", r."endDate", r."isApproximate",
      r.importance, r.latitude, r.longitude, r.sitelinks, 'published', ${now}::timestamptz
    from jsonb_to_recordset(${json(tx, eventRows)}::jsonb) as r(slug text, "wikidataId" text, "startYear" int,
      "endYear" int, "startDate" date, "endDate" date, "isApproximate" boolean, importance smallint,
      latitude numeric, longitude numeric, sitelinks int)
    on conflict (wikidata_id) do update set
      start_year = excluded.start_year, end_year = excluded.end_year, start_date = excluded.start_date,
      end_date = excluded.end_date, is_approximate = excluded.is_approximate, importance = excluded.importance,
      latitude = excluded.latitude, longitude = excluded.longitude, sitelinks = excluded.sitelinks`;
  await tx`
    update public.events e set sitelinks = r.sitelinks,
      latitude = coalesce(e.latitude, r.latitude), longitude = coalesce(e.longitude, r.longitude)
    from jsonb_to_recordset(${json(
      tx,
      bundle.events.filter((e) => manual.has(e.wikidataId)),
    )}::jsonb)
      as r("wikidataId" text, sitelinks int, latitude numeric, longitude numeric)
    where e.wikidata_id = r."wikidataId" and (r.latitude is null) = (r.longitude is null)
      and ((e.latitude is null) = (e.longitude is null))`;

  const eventIds = new Map(
    (
      await tx<{ id: string; wikidata_id: string }[]>`
      select id, wikidata_id from public.events where wikidata_id is not null`
    ).map((r) => [r.wikidata_id, r.id]),
  );

  const texts = bundle.events.flatMap((e) =>
    (["en", "ar"] as const).flatMap((locale) => {
      const t = e.text[locale];
      const id = eventIds.get(e.wikidataId);
      return t && id
        ? [
            {
              eventId: id,
              locale,
              title: t.title,
              summary: t.summary,
              place: t.placeLabel,
              keywords: t.keywords,
              sourceId: sourceId(t.source),
            },
          ]
        : [];
    }),
  );
  const textResult = await tx`
    insert into public.event_translations (event_id, locale, title, summary, place_label, keywords, origin, source_id)
    select r."eventId", r.locale, r.title, r.summary, r.place, array(select jsonb_array_elements_text(r.keywords)),
      'wikipedia', r."sourceId"
    from jsonb_to_recordset(${json(tx, texts)}::jsonb)
      as r("eventId" uuid, locale text, title text, summary text, place text, keywords jsonb, "sourceId" uuid)
    on conflict (event_id, locale) do update set
      title = excluded.title, summary = excluded.summary, place_label = excluded.place_label,
      keywords = excluded.keywords, origin = excluded.origin, source_id = excluded.source_id
      where public.event_translations.origin <> 'manual'`;

  // Text from an earlier run that this run no longer gives (an Arabic summary that turned
  // out to say nothing) is removed, so the page falls back to English and says so.
  const imports = bundle.events.flatMap((e) => {
    const id = eventIds.get(e.wikidataId);
    return id ? [{ eventId: id, locales: (["en", "ar"] as const).filter((l) => e.text[l]) }] : [];
  });
  await tx`
    delete from public.event_translations t
    using jsonb_to_recordset(${json(tx, imports)}::jsonb) as r("eventId" uuid, locales jsonb)
    where t.event_id = r."eventId" and t.origin = 'wikipedia' and not r.locales ? t.locale::text`;

  const heroes = bundle.events.flatMap((e) => {
    const ev = eventIds.get(e.wikidataId);
    const img = e.image ? imageId.get(e.image) : undefined;
    return ev && img ? [{ eventId: ev, imageId: img }] : [];
  });
  await tx`
    insert into public.event_images (event_id, image_id, role, sort_order)
    select r."eventId", r."imageId", 'hero', 0
    from jsonb_to_recordset(${json(tx, heroes)}::jsonb) as r("eventId" uuid, "imageId" uuid)
    where not exists (select 1 from public.event_images x where x.event_id = r."eventId" and x.role = 'hero')
    on conflict do nothing`;
  const eventSources = texts.flatMap((t) => (t.sourceId ? [{ eventId: t.eventId, sourceId: t.sourceId }] : []));
  await tx`
    insert into public.event_sources (event_id, source_id)
    select r."eventId", r."sourceId" from jsonb_to_recordset(${json(tx, eventSources)}::jsonb) as r("eventId" uuid, "sourceId" uuid)
    on conflict do nothing`;

  // 5. People and their life timelines.
  const peopleExisting = await tx<
    { slug: string; wikidata_id: string | null }[]
  >`select slug, wikidata_id from public.people`;
  const personSlugOwner = new Map(peopleExisting.map((r) => [r.slug, r.wikidata_id]));
  const personSlugByQid = new Map(peopleExisting.filter((r) => r.wikidata_id).map((r) => [r.wikidata_id!, r.slug]));
  const personRows = bundle.people.map((p) => ({
    wikidataId: p.wikidataId,
    slug: personSlugByQid.get(p.wikidataId) ?? freeSlug(p.slug, p.wikidataId, personSlugOwner),
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    birthDate: p.birthDate,
    deathDate: p.deathDate,
    isApproximate: p.isApproximate,
    sitelinks: p.sitelinks,
    imageId: p.image ? (imageId.get(p.image) ?? null) : null,
    notes: p.notes,
  }));
  const personIdRows = await tx<{ id: string; wikidata_id: string }[]>`
    insert into public.people (slug, wikidata_id, birth_year, death_year, birth_date, death_date, is_approximate,
      sitelinks, image_id, data_notes, status, published_at)
    select r.slug, r."wikidataId", r."birthYear", r."deathYear", r."birthDate", r."deathDate", r."isApproximate",
      r.sitelinks, r."imageId", array(select jsonb_array_elements_text(r.notes)), 'published', ${now}::timestamptz
    from jsonb_to_recordset(${json(tx, personRows)}::jsonb) as r(slug text, "wikidataId" text, "birthYear" int,
      "deathYear" int, "birthDate" date, "deathDate" date, "isApproximate" boolean, sitelinks int, "imageId" uuid,
      notes jsonb)
    on conflict (wikidata_id) do update set
      birth_year = excluded.birth_year, death_year = excluded.death_year, birth_date = excluded.birth_date,
      death_date = excluded.death_date, is_approximate = excluded.is_approximate, sitelinks = excluded.sitelinks,
      data_notes = excluded.data_notes,
      image_id = coalesce(public.people.image_id, excluded.image_id)
    returning id, wikidata_id`;
  const personId = new Map(personIdRows.map((r) => [r.wikidata_id, r.id]));

  const personTexts = bundle.people.flatMap((p) =>
    (["en", "ar"] as const).flatMap((locale) => {
      const t = p.text[locale];
      return t
        ? [{ personId: personId.get(p.wikidataId)!, locale, ...t, sourceId: sourceId(t.source), source: undefined }]
        : [];
    }),
  );
  await tx`
    insert into public.person_translations (person_id, locale, name, description, biography, birth_place, death_place,
      keywords, origin, source_id)
    select r."personId", r.locale, r.name, r.description, r.biography, r."birthPlace", r."deathPlace",
      array(select jsonb_array_elements_text(r.keywords)), 'wikipedia', r."sourceId"
    from jsonb_to_recordset(${json(tx, personTexts)}::jsonb) as r("personId" uuid, locale text, name text,
      description text, biography text, "birthPlace" text, "deathPlace" text, keywords jsonb, "sourceId" uuid)
    on conflict (person_id, locale) do update set
      name = excluded.name, description = excluded.description, biography = excluded.biography,
      birth_place = excluded.birth_place, death_place = excluded.death_place, keywords = excluded.keywords,
      origin = excluded.origin, source_id = excluded.source_id
      where public.person_translations.origin <> 'manual'`;

  // Life timelines are rebuilt from scratch for imported people.
  const ids = [...personId.values()];
  await tx`delete from public.person_events where person_id = any(${ids}::uuid[])`;
  const life = bundle.people.flatMap((p) =>
    p.life.map((l, i) => ({
      personId: personId.get(p.wikidataId)!,
      ord: i,
      ...l,
      eventId: l.wikidataId ? (eventIds.get(l.wikidataId) ?? null) : null,
      en: l.label.en,
      ar: l.label.ar,
      label: undefined,
    })),
  );
  const lifeRows = await tx<{ id: string; person_id: string; ord: number; en: string; ar: string | null }[]>`
    with r as (
      select * from jsonb_to_recordset(${json(tx, life)}::jsonb) as r("personId" uuid, ord int, kind text,
        "startYear" int, "endYear" int, "startDate" date, "endDate" date, "isApproximate" boolean,
        "wikidataId" text, "eventId" uuid, en text, ar text)
    ), ins as (
      insert into public.person_events (person_id, kind, start_year, end_year, start_date, end_date, is_approximate,
        wikidata_id, event_id)
      select r."personId", r.kind::public.life_event_kind, r."startYear", r."endYear", r."startDate", r."endDate",
        r."isApproximate", r."wikidataId", r."eventId"
      from r
      returning id, person_id, kind, coalesce(wikidata_id, '') as wid, start_year
    )
    select ins.id, ins.person_id, r.ord, r.en, r.ar
    from ins join r on r."personId" = ins.person_id and r.kind = ins.kind::text
      and coalesce(r."wikidataId", '') = ins.wid and r."startYear" = ins.start_year`;
  const lifeTexts = lifeRows.flatMap((r) => [
    { id: r.id, locale: "en", label: r.en },
    ...(r.ar ? [{ id: r.id, locale: "ar", label: r.ar }] : []),
  ]);
  await tx`
    insert into public.person_event_translations (person_event_id, locale, label)
    select r.id, r.locale, r.label from jsonb_to_recordset(${json(tx, lifeTexts)}::jsonb) as r(id uuid, locale text, label text)`;

  // 6. Topics. Hand-written topics keep their dates, name and summary; they gain events and people.
  // Countries, people groups and religions keep the slug they first got, found by Wikidata id.
  const topicsExisting = await tx<{ slug: string; wikidata_id: string | null }[]>`
    select slug, wikidata_id from public.topics`;
  const topicSlugOwner = new Map(topicsExisting.map((r) => [r.slug, r.wikidata_id]));
  const topicSlugByQid = new Map(topicsExisting.filter((r) => r.wikidata_id).map((r) => [r.wikidata_id!, r.slug]));
  for (const t of bundle.topics) if (t.kind === "topic") topicSlugOwner.set(t.slug, t.wikidataId);
  const topicSlug = new Map(
    bundle.topics.map((t) => [
      t.wikidataId,
      t.kind === "topic"
        ? t.slug
        : (topicSlugByQid.get(t.wikidataId) ?? freeSlug(t.slug, t.wikidataId, topicSlugOwner)),
    ]),
  );
  const topicRows = bundle.topics.map((t) => ({
    slug: topicSlug.get(t.wikidataId)!,
    kind: t.kind,
    wikidataId: t.wikidataId,
    isSensitive: t.isSensitive,
    startYear: t.startYear,
    endYear: t.endYear,
    isApproximate: t.isApproximate,
  }));
  const topicIdRows = await tx<{ id: string; slug: string }[]>`
    insert into public.topics (slug, kind, wikidata_id, is_sensitive, start_year, end_year, is_approximate, status, published_at)
    select r.slug, r.kind::public.topic_kind, r."wikidataId", r."isSensitive", r."startYear", r."endYear", r."isApproximate",
      'published', ${now}::timestamptz
    from jsonb_to_recordset(${json(tx, topicRows)}::jsonb) as r(slug text, kind text, "wikidataId" text,
      "isSensitive" boolean, "startYear" int, "endYear" int, "isApproximate" boolean)
    on conflict (slug) do update set
      -- A hand-picked topic stays one, even when a country of the same name merges into it.
      kind = case when public.topics.kind = 'topic' then public.topics.kind else excluded.kind end,
      wikidata_id = coalesce(public.topics.wikidata_id, excluded.wikidata_id),
      is_sensitive = public.topics.is_sensitive or excluded.is_sensitive,
      start_year = case when exists (select 1 from public.topic_translations tt where tt.topic_id = public.topics.id and tt.origin = 'manual') then public.topics.start_year else excluded.start_year end,
      end_year = case when exists (select 1 from public.topic_translations tt where tt.topic_id = public.topics.id and tt.origin = 'manual') then public.topics.end_year else excluded.end_year end,
      is_approximate = case when exists (select 1 from public.topic_translations tt where tt.topic_id = public.topics.id and tt.origin = 'manual') then public.topics.is_approximate else excluded.is_approximate end
    returning id, slug`;
  const idBySlug = new Map(topicIdRows.map((r) => [r.slug, r.id]));
  const topicId = new Map(bundle.topics.map((t) => [t.slug, idBySlug.get(topicSlug.get(t.wikidataId)!)!]));
  const topicByQid = new Map(bundle.topics.map((t) => [t.wikidataId, topicId.get(t.slug)!]));

  const topicTexts = bundle.topics.flatMap((t) =>
    (["en", "ar"] as const).flatMap((locale) => {
      const x = t.text[locale];
      return x
        ? [
            {
              topicId: topicId.get(t.slug)!,
              locale,
              name: x.name,
              summary: x.summary,
              keywords: x.keywords,
              sourceId: sourceId(x.source),
            },
          ]
        : [];
    }),
  );
  await tx`
    insert into public.topic_translations (topic_id, locale, name, summary, keywords, origin, source_id)
    select r."topicId", r.locale, r.name, r.summary, array(select jsonb_array_elements_text(r.keywords)), 'wikipedia', r."sourceId"
    from jsonb_to_recordset(${json(tx, topicTexts)}::jsonb)
      as r("topicId" uuid, locale text, name text, summary text, keywords jsonb, "sourceId" uuid)
    on conflict (topic_id, locale) do update set
      name = excluded.name, summary = excluded.summary, keywords = excluded.keywords,
      origin = excluded.origin, source_id = excluded.source_id
      where public.topic_translations.origin <> 'manual'`;

  // Countries, people groups and religions are rebuilt from Wikidata on every run.
  const groupIds = bundle.topics.filter((t) => t.kind !== "topic").map((t) => topicId.get(t.slug)!);
  await tx`
    delete from public.topic_events te using public.topics t
    where te.topic_id = t.id and t.id = any(${groupIds}::uuid[]) and t.kind <> 'topic'`;
  const members = bundle.topics.flatMap((t) =>
    t.events.flatMap((q) =>
      eventIds.get(q) ? [{ topicId: topicId.get(t.slug)!, eventId: eventIds.get(q)!, via: t.via[q] ?? null }] : [],
    ),
  );
  const memberResult = await tx`
    insert into public.topic_events (topic_id, event_id, via)
    select r."topicId", r."eventId", r.via
    from jsonb_to_recordset(${json(tx, members)}::jsonb) as r("topicId" uuid, "eventId" uuid, via text)
    on conflict (topic_id, event_id) do update set via = excluded.via where excluded.via is not null`;
  // Every topic's events run in time order.
  await tx`
    update public.topic_events te set sort_order = o.n
    from (
      select te.topic_id, te.event_id, row_number() over (partition by te.topic_id order by e.start_year, e.importance, e.slug) as n
      from public.topic_events te join public.events e on e.id = te.event_id
    ) o
    where te.topic_id = o.topic_id and te.event_id = o.event_id and te.sort_order is distinct from o.n`;

  const topicIds = [...topicId.values()];
  await tx`delete from public.topic_people where topic_id = any(${topicIds}::uuid[])`;
  const topicPeople = bundle.topics.flatMap((t) =>
    t.people.flatMap((q, i) =>
      personId.get(q)
        ? [{ topicId: topicId.get(t.slug)!, personId: personId.get(q)!, n: i, via: t.via[q] ?? null }]
        : [],
    ),
  );
  await tx`
    insert into public.topic_people (topic_id, person_id, sort_order, via)
    select r."topicId", r."personId", r.n, r.via
    from jsonb_to_recordset(${json(tx, topicPeople)}::jsonb) as r("topicId" uuid, "personId" uuid, n int, via text)
    on conflict do nothing`;

  await tx`delete from public.topic_successors where topic_id = any(${topicIds}::uuid[])`;
  const successors = bundle.topics.flatMap((t) =>
    t.successors.flatMap((q) =>
      topicByQid.get(q) ? [{ topicId: topicId.get(t.slug)!, successorId: topicByQid.get(q)! }] : [],
    ),
  );
  await tx`
    insert into public.topic_successors (topic_id, successor_id)
    select r."topicId", r."successorId"
    from jsonb_to_recordset(${json(tx, successors)}::jsonb) as r("topicId" uuid, "successorId" uuid)
    where r."topicId" <> r."successorId"
    on conflict do nothing`;

  return {
    images: imageRows.length,
    events: eventRows.length,
    eventTexts: textResult.count,
    people: personIdRows.length,
    lifeEvents: lifeRows.length,
    topics: topicIdRows.length,
    topicEvents: memberResult.count,
  };
}
