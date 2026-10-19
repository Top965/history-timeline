import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type {
  CommonsImage,
  Era,
  EventLink,
  EventPage,
  LifeEventKind,
  PersonCard,
  PersonPage,
  PersonSummary,
  SearchData,
  Story,
  StoryChapter,
  TextSource,
  TimelineData,
  TimelineEvent,
  TimelineTile,
  Topic,
  TopicKind,
  TopicLink,
  TopicPage,
} from "@/lib/content/types";
import { CONTENT_SOURCE_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { isDataNote } from "@/lib/people/notes";
import { TILE_LIMIT, tileRange, type TileLevel } from "@/lib/timeline/tiles";
import { publicRead, type Tx } from "./client";

/** Cache tags, so later steps (admin approval) can revalidate exactly what changed. */
export const CACHE_TAGS = {
  timeline: "timeline",
  event: (slug: string) => `event:${slug}`,
  person: (slug: string) => `person:${slug}`,
  topic: (slug: string) => `topic:${slug}`,
  search: "search",
} as const;

const SRC = CONTENT_SOURCE_LOCALE;
const asLocale = (v: string): Locale => (isLocale(v) ? v : SRC);
const asImportance = (v: number): 1 | 2 | 3 => (v === 1 || v === 2 ? v : 3);
/** postgres.js returns `date` columns as JS Dates at UTC midnight; we keep ISO strings. */
const isoDate = (v: Date | string | null): string | null =>
  v == null ? null : typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

type EraRow = {
  slug: string;
  name: string;
  start_year: number;
  end_year: number | null;
  color_token: string;
  keywords: string[];
};

type EventRow = {
  slug: string;
  title: string;
  place: string;
  start_year: number;
  end_year: number | null;
  is_approximate: boolean;
  importance: number;
  has_full_story: boolean;
  text_locale: string;
  keywords: string[];
};

type TopicRow = {
  slug: string;
  kind: TopicKind;
  name: string;
  summary: string | null;
  summary_locale: string;
  start_year: number;
  end_year: number | null;
  is_approximate: boolean;
  event_slugs: string[];
  keywords: string[];
};

type PersonRow = {
  slug: string;
  name: string;
  description: string | null;
  birth_year: number;
  death_year: number | null;
  is_approximate: boolean;
  text_locale: string;
  keywords: string[];
};

async function loadEras(tx: Tx, locale: Locale): Promise<Era[]> {
  const rows = await tx<EraRow[]>`
    select e.slug, coalesce(l.name, d.name) as name, e.start_year, e.end_year, e.color_token,
      (select coalesce(array_agg(distinct k), '{}') from public.era_translations t, unnest(t.keywords || t.name) k
        where t.era_id = e.id) as keywords
    from public.eras e
    join public.era_translations d on d.era_id = e.id and d.locale = ${SRC}
    left join public.era_translations l on l.era_id = e.id and l.locale = ${locale}
    order by e.sort_order`;
  return rows.map((r): Era => ({
    slug: r.slug,
    name: r.name,
    startYear: r.start_year,
    endYear: r.end_year,
    colorToken: r.color_token,
    keywords: r.keywords,
  }));
}

type EventFilter = {
  /** Only events of these importances. */
  importance?: (1 | 2 | 3)[];
  /** Events overlapping [from, to]. */
  from?: number;
  to?: number;
  /** Search keywords; the browser never needs them. */
  keywords: boolean;
  /** Keep only the best known: hand-written first, then by Wikipedia language count. */
  limit?: number;
};

async function loadEvents(tx: Tx, locale: Locale, f: EventFilter): Promise<TimelineEvent[]> {
  const rows = await tx<EventRow[]>`
    select e.slug, coalesce(l.title, d.title) as title, coalesce(l.place_label, d.place_label) as place,
      e.start_year, e.end_year, e.is_approximate, e.importance,
      exists (select 1 from public.stories s where s.event_id = e.id and s.layout = 'full') as has_full_story,
      case when l.event_id is null then ${SRC} else ${locale} end as text_locale,
      case when ${f.keywords}::boolean then
        (select coalesce(array_agg(distinct k), '{}') from public.event_translations t, unnest(t.keywords) k
          where t.event_id = e.id)
      else '{}' end as keywords
    from public.events e
    join public.event_translations d on d.event_id = e.id and d.locale = ${SRC}
    left join public.event_translations l on l.event_id = e.id and l.locale = ${locale}
    where e.status = 'published'
      and (${f.importance ?? null}::int[] is null or e.importance = any(${f.importance ?? null}::int[]))
      and (${f.to ?? null}::int is null or e.start_year <= ${f.to ?? null}::int)
      and (${f.from ?? null}::int is null or coalesce(e.end_year, e.start_year) >= ${f.from ?? null}::int)
    order by
      case when ${f.limit ?? null}::int is null then null else e.importance end,
      case when ${f.limit ?? null}::int is null then null else coalesce(e.sitelinks, 100000) end desc,
      e.start_year, e.importance, e.slug
    limit ${f.limit ?? null}::int`;
  return rows.map((r): TimelineEvent => ({
    slug: r.slug,
    title: r.title,
    place: r.place,
    startYear: r.start_year,
    endYear: r.end_year,
    isApproximate: r.is_approximate,
    importance: asImportance(r.importance),
    hasFullStory: r.has_full_story,
    textLocale: asLocale(r.text_locale),
    keywords: r.keywords,
  }));
}

async function loadTopics(tx: Tx, locale: Locale): Promise<Topic[]> {
  const rows = await tx<TopicRow[]>`
    select t.slug, t.kind, coalesce(l.name, d.name) as name, coalesce(l.summary, d.summary) as summary,
      case when l.summary is null then ${SRC} else ${locale} end as summary_locale,
      t.start_year, t.end_year, t.is_approximate,
      coalesce((select array_agg(e.slug order by te.sort_order)
        from public.topic_events te join public.events e on e.id = te.event_id
        where te.topic_id = t.id), '{}') as event_slugs,
      (select coalesce(array_agg(distinct k), '{}') from public.topic_translations tt, unnest(tt.keywords || tt.name) k
        where tt.topic_id = t.id) as keywords
    from public.topics t
    join public.topic_translations d on d.topic_id = t.id and d.locale = ${SRC}
    left join public.topic_translations l on l.topic_id = t.id and l.locale = ${locale}
    where t.status = 'published'
    order by t.start_year, t.slug`;
  return rows.map((r): Topic => ({
    slug: r.slug,
    kind: r.kind,
    name: r.name,
    summary: r.summary ?? "",
    summaryLocale: asLocale(r.summary_locale),
    startYear: r.start_year,
    endYear: r.end_year,
    isApproximate: r.is_approximate,
    eventSlugs: r.event_slugs,
    keywords: r.keywords,
  }));
}

async function loadPeople(tx: Tx, locale: Locale): Promise<PersonSummary[]> {
  const rows = await tx<PersonRow[]>`
    select p.slug, coalesce(l.name, d.name) as name, coalesce(l.description, d.description) as description,
      p.birth_year, p.death_year, p.is_approximate,
      case when l.person_id is null then ${SRC} else ${locale} end as text_locale,
      (select coalesce(array_agg(distinct k), '{}') from public.person_translations t, unnest(t.keywords || t.name) k
        where t.person_id = p.id) as keywords
    from public.people p
    join public.person_translations d on d.person_id = p.id and d.locale = ${SRC}
    left join public.person_translations l on l.person_id = p.id and l.locale = ${locale}
    where p.status = 'published'
    order by p.sitelinks desc nulls last, p.slug`;
  return rows.map((r): PersonSummary => ({
    slug: r.slug,
    name: r.name,
    description: r.description,
    birthYear: r.birth_year,
    deathYear: r.death_year,
    isApproximate: r.is_approximate,
    textLocale: asLocale(r.text_locale),
    keywords: r.keywords,
  }));
}

/** What every timeline page ships: eras and the biggest events. Cached and shared by all visitors. */
export async function getTimelineData(locale: Locale): Promise<TimelineData> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.timeline);
  const data = await publicRead(
    "timeline.load",
    async (tx) => ({
      eras: await loadEras(tx, locale),
      events: await loadEvents(tx, locale, { importance: [1], keywords: false }),
    }),
    { locale },
  );
  return { ...data, currentYear: new Date().getUTCFullYear() };
}

/** Smaller events for one stretch of time (see src/lib/timeline/tiles.ts). */
export async function getTimelineTile(locale: Locale, level: TileLevel, tile: number): Promise<TimelineTile> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.timeline);
  const { from, to } = tileRange(level, tile);
  const events = await publicRead(
    "timeline.tile",
    (tx) =>
      loadEvents(tx, locale, { importance: level === 2 ? [2] : [2, 3], from, to, keywords: false, limit: TILE_LIMIT }),
    { locale, level, tile },
  );
  return { level, tile, events };
}

/** Everything search looks through, for the server-side search index. */
export async function getSearchData(locale: Locale): Promise<SearchData> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.timeline, CACHE_TAGS.search);
  const data = await publicRead(
    "search.load",
    async (tx) => ({
      eras: await loadEras(tx, locale),
      events: await loadEvents(tx, locale, { keywords: true }),
      topics: await loadTopics(tx, locale),
      people: await loadPeople(tx, locale),
    }),
    { locale },
  );
  return { ...data, currentYear: new Date().getUTCFullYear() };
}

// ---------------------------------------------------------------------------
// Event page
// ---------------------------------------------------------------------------

type ImageRow = {
  commons_file: string;
  file_page_url: string;
  original_url: string;
  width: number;
  height: number;
  mime_type: string;
  license_short_name: string;
  license_url: string | null;
  author_text: string;
  author_url: string | null;
  caption: string | null;
  alt_text: string | null;
};

const imageColumns = (tx: Tx, locale: Locale) => tx`
  i.commons_file, i.file_page_url, i.original_url, i.width, i.height, i.mime_type,
  i.license_short_name, i.license_url, i.author_text, i.author_url,
  coalesce(
    (select it.caption from public.image_translations it where it.image_id = i.id and it.locale = ${locale}),
    (select it.caption from public.image_translations it where it.image_id = i.id and it.locale = ${SRC})
  ) as caption,
  coalesce(
    (select it.alt_text from public.image_translations it where it.image_id = i.id and it.locale = ${locale}),
    (select it.alt_text from public.image_translations it where it.image_id = i.id and it.locale = ${SRC})
  ) as alt_text`;

function toImage(r: ImageRow, fallbackCaption: string): CommonsImage {
  const caption = r.caption ?? fallbackCaption;
  return {
    commonsFile: r.commons_file,
    filePageUrl: r.file_page_url,
    originalUrl: r.original_url,
    width: r.width,
    height: r.height,
    mimeType: r.mime_type,
    license: r.license_short_name,
    licenseUrl: r.license_url,
    author: r.author_text,
    authorUrl: r.author_url,
    caption,
    alt: r.alt_text ?? caption,
  };
}

type EventPageRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  place: string;
  media_hint: string | null;
  text_locale: string;
  start_year: number;
  end_year: number | null;
  start_date: Date | null;
  end_date: Date | null;
  is_approximate: boolean;
  importance: number;
};

type LinkRow = { slug: string; title: string; start_year: number; end_year: number | null; is_approximate: boolean };

const toLink = (r: LinkRow): EventLink => ({
  slug: r.slug,
  title: r.title,
  startYear: r.start_year,
  endYear: r.end_year,
  isApproximate: r.is_approximate,
});

async function loadEventPage(tx: Tx, locale: Locale, slug: string): Promise<EventPage | null> {
  const [ev] = await tx<EventPageRow[]>`
    select e.id, e.slug, coalesce(l.title, d.title) as title, coalesce(l.summary, d.summary) as summary,
      coalesce(l.place_label, d.place_label) as place, coalesce(l.media_hint, d.media_hint) as media_hint,
      case when l.event_id is null then ${SRC} else ${locale} end as text_locale,
      e.start_year, e.end_year, e.start_date, e.end_date, e.is_approximate, e.importance
    from public.events e
    join public.event_translations d on d.event_id = e.id and d.locale = ${SRC}
    left join public.event_translations l on l.event_id = e.id and l.locale = ${locale}
    where e.slug = ${slug} and e.status = 'published'`;
  if (!ev) return null;

  const linkSelect = tx`
    e.slug, coalesce(l.title, d.title) as title, e.start_year, e.end_year, e.is_approximate
    from public.events e
    join public.event_translations d on d.event_id = e.id and d.locale = ${SRC}
    left join public.event_translations l on l.event_id = e.id and l.locale = ${locale}`;

  const [previous] = await tx<LinkRow[]>`
    select ${linkSelect}
    where e.status = 'published' and (e.start_year, e.importance, e.slug) < (${ev.start_year}, ${ev.importance}, ${ev.slug})
    order by e.start_year desc, e.importance desc, e.slug desc limit 1`;
  const [next] = await tx<LinkRow[]>`
    select ${linkSelect}
    where e.status = 'published' and (e.start_year, e.importance, e.slug) > (${ev.start_year}, ${ev.importance}, ${ev.slug})
    order by e.start_year, e.importance, e.slug limit 1`;

  const [era] = await tx<{ slug: string; name: string }[]>`
    select r.slug, coalesce(l.name, d.name) as name
    from public.eras r
    join public.era_translations d on d.era_id = r.id and d.locale = ${SRC}
    left join public.era_translations l on l.era_id = r.id and l.locale = ${locale}
    where r.start_year <= ${ev.start_year} and (r.end_year is null or ${ev.start_year} < r.end_year)
    order by r.start_year desc limit 1`;

  const [hero] = await tx<ImageRow[]>`
    select ${imageColumns(tx, locale)}
    from public.event_images ei join public.images i on i.id = ei.image_id
    where ei.event_id = ${ev.id} and ei.role = 'hero'`;

  const story = await loadStory(tx, ev.id, locale);

  const [source] = await tx<SourceRow[]>`
    select s.url, s.title, s.license
    from public.event_translations t join public.sources s on s.id = t.source_id
    where t.event_id = ${ev.id} and t.locale = ${ev.text_locale}`;
  const topics = await tx<TopicLinkRow[]>`
    select t.slug, t.kind, coalesce(l.name, d.name) as name, t.start_year, t.end_year, t.is_approximate
    from public.topic_events te
    join public.topics t on t.id = te.topic_id
    join public.topic_translations d on d.topic_id = t.id and d.locale = ${SRC}
    left join public.topic_translations l on l.topic_id = t.id and l.locale = ${locale}
    where te.event_id = ${ev.id} and t.status = 'published'
    order by t.kind, t.start_year`;
  const people = await loadPersonCards(
    tx,
    locale,
    tx`p.id in (select pe.person_id from public.person_events pe where pe.event_id = ${ev.id})`,
    tx`p.sitelinks desc nulls last`,
    8,
  );

  return {
    event: {
      slug: ev.slug,
      title: ev.title,
      summary: ev.summary,
      place: ev.place,
      startYear: ev.start_year,
      endYear: ev.end_year,
      startDate: isoDate(ev.start_date),
      endDate: isoDate(ev.end_date),
      isApproximate: ev.is_approximate,
      importance: asImportance(ev.importance),
      mediaHint: ev.media_hint,
      textLocale: asLocale(ev.text_locale),
    },
    era: era ?? null,
    hero: hero ? toImage(hero, ev.media_hint ?? ev.title) : null,
    story,
    source: source ? toSource(source) : null,
    topics: topics.map(toTopicLink),
    people,
    previous: previous ? toLink(previous) : null,
    next: next ? toLink(next) : null,
  };
}

async function loadStory(tx: Tx, eventId: string, locale: Locale): Promise<Story | null> {
  // Prefer the visitor's language; fall back to the source language.
  const [story] = await tx<
    { id: string; locale: string; layout: "short" | "full"; dek: string | null; footnote: string | null }[]
  >`
    select s.id, s.locale, s.layout, s.dek, s.footnote
    from public.stories s
    where s.event_id = ${eventId} and s.locale in (${locale}, ${SRC})
    order by (s.locale = ${locale}) desc
    limit 1`;
  if (!story) return null;

  const storyLocale = asLocale(story.locale);
  const [stats, keyDates, chapterRows, sideRows, people, related] = await Promise.all([
    tx<{ value_label: string; description: string }[]>`
      select value_label, description from public.story_stats where story_id = ${story.id} order by sort_order`,
    tx<{ date: Date; label: string; chapter_order: number | null }[]>`
      select date, label, chapter_order from public.story_key_dates where story_id = ${story.id} order by sort_order`,
    tx<
      (Partial<ImageRow> & {
        sort_order: number;
        title: string;
        period_label: string;
        paragraphs: string[];
        figure_kind: "photo" | "map" | null;
        figure_caption: string | null;
        shows_sides: boolean;
        has_image: boolean;
      })[]
    >`
      select c.sort_order, c.title, c.period_label, c.paragraphs, c.figure_kind, c.figure_caption, c.shows_sides,
        (i.id is not null) as has_image, ${imageColumns(tx, storyLocale)}
      from public.story_chapters c left join public.images i on i.id = c.image_id
      where c.story_id = ${story.id} order by c.sort_order`,
    tx<{ name: string; members: { name: string; note: string | null }[] }[]>`
      select s.name,
        coalesce((select json_agg(json_build_object('name', m.name, 'note', m.note) order by m.sort_order)
          from public.story_side_members m where m.side_id = s.id), '[]'::json) as members
      from public.story_sides s where s.story_id = ${story.id} order by s.sort_order`,
    tx<(Partial<ImageRow> & { name: string; description: string; initials: string; has_image: boolean })[]>`
      select p.name, p.description, p.initials, (i.id is not null) as has_image, ${imageColumns(tx, storyLocale)}
      from public.story_people p left join public.images i on i.id = p.image_id
      where p.story_id = ${story.id} order by p.sort_order`,
    tx<LinkRow[]>`
      select e.slug, coalesce(l.title, d.title) as title, e.start_year, e.end_year, e.is_approximate
      from public.story_related r
      join public.events e on e.id = r.related_event_id
      join public.event_translations d on d.event_id = e.id and d.locale = ${SRC}
      left join public.event_translations l on l.event_id = e.id and l.locale = ${locale}
      where r.story_id = ${story.id} and e.status = 'published'
      order by r.sort_order`,
  ]);

  const chapters = chapterRows.map((c): StoryChapter => ({
    order: c.sort_order,
    title: c.title,
    period: c.period_label,
    paragraphs: c.paragraphs,
    figure: c.figure_kind
      ? {
          kind: c.figure_kind,
          caption: c.figure_caption ?? "",
          image: c.has_image ? toImage(c as ImageRow, c.figure_caption ?? c.title) : null,
        }
      : null,
    showsSides: c.shows_sides,
  }));

  return {
    locale: storyLocale,
    layout: story.layout,
    dek: story.dek,
    footnote: story.footnote,
    stats: stats.map((s) => ({ value: s.value_label, description: s.description })),
    keyDates: keyDates.map((d) => ({ date: isoDate(d.date)!, label: d.label, chapter: d.chapter_order })),
    chapters,
    sides: sideRows.map((s) => ({ name: s.name, members: s.members })),
    people: people.map((p) => ({
      name: p.name,
      description: p.description,
      initials: p.initials,
      image: p.has_image ? toImage(p as ImageRow, p.name) : null,
    })),
    related: related.map(toLink),
  };
}

export async function getEventPage(locale: Locale, slug: string): Promise<EventPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.event(slug));
  return publicRead("event.load", (tx) => loadEventPage(tx, locale, slug), { locale, slug });
}

/** Slugs of all published events, for static generation and the sitemap. */
export async function getPublishedEventSlugs(): Promise<{ slug: string; updatedAt: string; importance: 1 | 2 | 3 }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.timeline);
  const rows = await publicRead(
    "event.slugs",
    (tx) => tx<{ slug: string; updated_at: Date; importance: number }[]>`
    select slug, updated_at, importance from public.events where status = 'published' order by start_year, slug`,
  );
  return rows.map((r) => ({
    slug: r.slug,
    updatedAt: r.updated_at.toISOString(),
    importance: asImportance(r.importance),
  }));
}

// ---------------------------------------------------------------------------
// Shared pieces for people and topics
// ---------------------------------------------------------------------------

type SourceRow = { url: string; title: string; license: string | null };
const toSource = (r: SourceRow): TextSource => ({ url: r.url, title: r.title, license: r.license });

type TopicLinkRow = {
  slug: string;
  kind: TopicKind;
  name: string;
  start_year: number;
  end_year: number | null;
  is_approximate: boolean;
};
const toTopicLink = (r: TopicLinkRow): TopicLink => ({
  slug: r.slug,
  kind: r.kind,
  name: r.name,
  startYear: r.start_year,
  endYear: r.end_year,
  isApproximate: r.is_approximate,
});

type PersonCardRow = Partial<ImageRow> & {
  slug: string;
  name: string;
  description: string | null;
  birth_year: number;
  death_year: number | null;
  is_approximate: boolean;
  text_locale: string;
  has_image: boolean;
};

const toPersonCard = (r: PersonCardRow): PersonCard => ({
  slug: r.slug,
  name: r.name,
  description: r.description,
  birthYear: r.birth_year,
  deathYear: r.death_year,
  isApproximate: r.is_approximate,
  textLocale: asLocale(r.text_locale),
  image: r.has_image ? toImage(r as ImageRow, r.name) : null,
});

/** Published people matching `where` (a fragment on alias p), with their photo. */
async function loadPersonCards(
  tx: Tx,
  locale: Locale,
  where: ReturnType<Tx>,
  orderBy: ReturnType<Tx>,
  limit: number,
): Promise<PersonCard[]> {
  const rows = await tx<PersonCardRow[]>`
    select p.slug, coalesce(l.name, d.name) as name, coalesce(l.description, d.description) as description,
      p.birth_year, p.death_year, p.is_approximate,
      case when l.person_id is null then ${SRC} else ${locale} end as text_locale,
      (i.id is not null) as has_image, ${imageColumns(tx, locale)}
    from public.people p
    join public.person_translations d on d.person_id = p.id and d.locale = ${SRC}
    left join public.person_translations l on l.person_id = p.id and l.locale = ${locale}
    left join public.images i on i.id = p.image_id
    where p.status = 'published' and ${where}
    order by ${orderBy}
    limit ${limit}`;
  return rows.map(toPersonCard);
}

// ---------------------------------------------------------------------------
// Person page
// ---------------------------------------------------------------------------

async function loadPersonPage(tx: Tx, locale: Locale, slug: string): Promise<PersonPage | null> {
  const [p] = await tx<
    (PersonCardRow & {
      id: string;
      biography: string | null;
      birth_date: Date | null;
      death_date: Date | null;
      birth_place: string | null;
      death_place: string | null;
      bio_locale: string;
      wikidata_id: string | null;
      added_via: string;
      data_notes: string[];
    })[]
  >`
    select p.id, p.slug, p.wikidata_id, p.added_via::text, p.data_notes, coalesce(l.name, d.name) as name, coalesce(l.description, d.description) as description,
      p.birth_year, p.death_year, p.birth_date, p.death_date, p.is_approximate,
      case when l.person_id is null then ${SRC} else ${locale} end as text_locale,
      coalesce(l.biography, d.biography) as biography,
      case when l.biography is null then ${SRC} else ${locale} end as bio_locale,
      coalesce(l.birth_place, d.birth_place) as birth_place, coalesce(l.death_place, d.death_place) as death_place,
      (i.id is not null) as has_image, ${imageColumns(tx, locale)}
    from public.people p
    join public.person_translations d on d.person_id = p.id and d.locale = ${SRC}
    left join public.person_translations l on l.person_id = p.id and l.locale = ${locale}
    left join public.images i on i.id = p.image_id
    where p.slug = ${slug} and p.status = 'published'`;
  if (!p) return null;

  const [source] = await tx<SourceRow[]>`
    select s.url, s.title, s.license
    from public.person_translations t join public.sources s on s.id = t.source_id
    where t.person_id = ${p.id} and t.locale = ${p.bio_locale}`;

  const life = await tx<
    {
      kind: LifeEventKind;
      start_year: number;
      end_year: number | null;
      start_date: Date | null;
      end_date: Date | null;
      is_approximate: boolean;
      label: string;
      label_locale: string;
      event_slug: string | null;
    }[]
  >`
    select pe.kind, pe.start_year, pe.end_year, pe.start_date, pe.end_date, pe.is_approximate,
      coalesce(l.label, d.label) as label, case when l.label is null then ${SRC} else ${locale} end as label_locale,
      e.slug as event_slug
    from public.person_events pe
    join public.person_event_translations d on d.person_event_id = pe.id and d.locale = ${SRC}
    left join public.person_event_translations l on l.person_event_id = pe.id and l.locale = ${locale}
    left join public.events e on e.id = pe.event_id and e.status = 'published'
    where pe.person_id = ${p.id}
    order by pe.start_year, (pe.kind = 'birth') desc, (pe.kind = 'death'), pe.start_date nulls last, label`;

  const end = p.death_year ?? new Date().getUTCFullYear();
  const world = await tx<(LinkRow & { importance: number; text_locale: string })[]>`
    select e.slug, coalesce(l.title, d.title) as title, e.start_year, e.end_year, e.is_approximate, e.importance,
      case when l.event_id is null then ${SRC} else ${locale} end as text_locale
    from public.events e
    join public.event_translations d on d.event_id = e.id and d.locale = ${SRC}
    left join public.event_translations l on l.event_id = e.id and l.locale = ${locale}
    where e.status = 'published' and e.importance = 1
      and e.start_year >= ${p.birth_year} and e.start_year <= ${end}
      -- Events already in their own life are not repeated as world events.
      and not exists (select 1 from public.person_events pe where pe.person_id = ${p.id} and pe.event_id = e.id)
    order by e.start_year, e.slug
    limit 40`;

  const topics = await tx<TopicLinkRow[]>`
    select t.slug, t.kind, coalesce(l.name, d.name) as name, t.start_year, t.end_year, t.is_approximate
    from public.topic_people tp
    join public.topics t on t.id = tp.topic_id
    join public.topic_translations d on d.topic_id = t.id and d.locale = ${SRC}
    left join public.topic_translations l on l.topic_id = t.id and l.locale = ${locale}
    where tp.person_id = ${p.id} and t.status = 'published'
    order by t.kind, t.start_year`;

  return {
    person: {
      ...toPersonCard(p),
      biography: p.biography,
      birthDate: isoDate(p.birth_date),
      deathDate: isoDate(p.death_date),
      birthPlace: p.birth_place,
      deathPlace: p.death_place,
      wikidataId: p.wikidata_id,
      addedFromSearch: p.added_via === "search",
      notes: p.data_notes.filter(isDataNote),
    },
    source: source ? toSource(source) : null,
    life: life.map((r) => ({
      kind: r.kind,
      startYear: r.start_year,
      endYear: r.end_year,
      startDate: isoDate(r.start_date),
      endDate: isoDate(r.end_date),
      isApproximate: r.is_approximate,
      label: r.label,
      labelLocale: asLocale(r.label_locale),
      eventSlug: r.event_slug,
    })),
    world: world.map((r) => ({
      ...toLink(r),
      importance: asImportance(r.importance),
      textLocale: asLocale(r.text_locale),
    })),
    topics: topics.map(toTopicLink),
  };
}

export async function getPersonPage(locale: Locale, slug: string): Promise<PersonPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.person(slug));
  return publicRead("person.load", (tx) => loadPersonPage(tx, locale, slug), { locale, slug });
}

// ---------------------------------------------------------------------------
// Topic page
// ---------------------------------------------------------------------------

/** Country, people group and religion pages list this many of their best-known events. */
export const GROUP_EVENT_LIMIT = 200;
const GROUP_PEOPLE_LIMIT = 48;

async function loadTopicPage(tx: Tx, locale: Locale, slug: string): Promise<TopicPage | null> {
  const [t] = await tx<(TopicRow & { id: string; is_sensitive: boolean })[]>`
    select t.id, t.slug, t.kind, coalesce(l.name, d.name) as name, coalesce(l.summary, d.summary) as summary,
      case when l.summary is null then ${SRC} else ${locale} end as summary_locale,
      t.start_year, t.end_year, t.is_approximate, t.is_sensitive,
      coalesce((select array_agg(e.slug order by te.sort_order)
        from public.topic_events te join public.events e on e.id = te.event_id
        where te.topic_id = t.id and e.status = 'published'), '{}') as event_slugs,
      '{}'::text[] as keywords
    from public.topics t
    join public.topic_translations d on d.topic_id = t.id and d.locale = ${SRC}
    left join public.topic_translations l on l.topic_id = t.id and l.locale = ${locale}
    where t.slug = ${slug} and t.status = 'published'`;
  if (!t) return null;
  const isGroup = t.kind !== "topic";

  const [source] = await tx<SourceRow[]>`
    select s.url, s.title, s.license
    from public.topic_translations tt join public.sources s on s.id = tt.source_id
    where tt.topic_id = ${t.id} and tt.locale = ${t.summary_locale}`;

  // Hand-picked topics show every event; the others their best known, still in time order.
  const events = await tx<
    (LinkRow & {
      summary: string;
      place: string;
      importance: number;
      text_locale: string;
      has_full_story: boolean;
      wikidata_id: string | null;
      via: string | null;
    })[]
  >`
    select * from (
      select e.slug, coalesce(l.title, d.title) as title, coalesce(l.summary, d.summary) as summary,
        coalesce(l.place_label, d.place_label) as place, e.start_year, e.end_year, e.is_approximate, e.importance,
        case when l.event_id is null then ${SRC} else ${locale} end as text_locale,
        exists (select 1 from public.stories s where s.event_id = e.id and s.layout = 'full') as has_full_story,
        e.wikidata_id, te.via
      from public.topic_events te
      join public.events e on e.id = te.event_id
      join public.event_translations d on d.event_id = e.id and d.locale = ${SRC}
      left join public.event_translations l on l.event_id = e.id and l.locale = ${locale}
      where te.topic_id = ${t.id} and e.status = 'published'
      order by e.importance, e.sitelinks desc nulls last, e.slug
      limit ${isGroup ? GROUP_EVENT_LIMIT : 100_000}
    ) x
    order by x.start_year, x.importance, x.slug`;

  const [{ events: eventTotal, people: peopleTotal }] = await tx<{ events: number; people: number }[]>`
    select
      (select count(*)::int from public.topic_events te join public.events e on e.id = te.event_id
        where te.topic_id = ${t.id} and e.status = 'published') as events,
      (select count(*)::int from public.topic_people tp join public.people p on p.id = tp.person_id
        where tp.topic_id = ${t.id} and p.status = 'published') as people`;

  const people = await loadPersonCards(
    tx,
    locale,
    tx`p.id in (select tp.person_id from public.topic_people tp where tp.topic_id = ${t.id})`,
    tx`(select tp.sort_order from public.topic_people tp where tp.topic_id = ${t.id} and tp.person_id = p.id)`,
    isGroup ? GROUP_PEOPLE_LIMIT : 24,
  );
  const peopleVia = new Map(
    (
      await tx<{ slug: string; wikidata_id: string | null; via: string | null }[]>`
      select p.slug, p.wikidata_id, tp.via from public.topic_people tp join public.people p on p.id = tp.person_id
      where tp.topic_id = ${t.id} and p.slug = any(${people.map((p) => p.slug)}::text[])`
    ).map((r) => [r.slug, r]),
  );
  const memberSource = (r: { wikidata_id: string | null; via: string | null } | undefined) =>
    r?.wikidata_id && r.via ? { wikidataId: r.wikidata_id, via: r.via } : null;

  const related = (direction: "successors" | "predecessors") => tx<TopicLinkRow[]>`
    select t.slug, t.kind, coalesce(l.name, d.name) as name, t.start_year, t.end_year, t.is_approximate
    from public.topic_successors ts
    join public.topics t on t.id = ${direction === "successors" ? tx`ts.successor_id` : tx`ts.topic_id`}
    join public.topic_translations d on d.topic_id = t.id and d.locale = ${SRC}
    left join public.topic_translations l on l.topic_id = t.id and l.locale = ${locale}
    where ${direction === "successors" ? tx`ts.topic_id` : tx`ts.successor_id`} = ${t.id} and t.status = 'published'
    order by t.start_year, name`;

  return {
    topic: {
      slug: t.slug,
      kind: t.kind,
      name: t.name,
      summary: t.summary ?? "",
      summaryLocale: asLocale(t.summary_locale),
      startYear: t.start_year,
      endYear: t.end_year,
      isApproximate: t.is_approximate,
      eventSlugs: t.event_slugs,
      keywords: [],
      isSensitive: t.is_sensitive,
    },
    source: source ? toSource(source) : null,
    events: events.map((r) => ({
      ...toLink(r),
      summary: r.summary,
      place: r.place,
      importance: asImportance(r.importance),
      textLocale: asLocale(r.text_locale),
      hasFullStory: r.has_full_story,
      source: memberSource(r),
    })),
    eventTotal,
    people: people.map((p) => ({ ...p, source: memberSource(peopleVia.get(p.slug)) })),
    peopleTotal,
    successors: (await related("successors")).map(toTopicLink),
    predecessors: (await related("predecessors")).map(toTopicLink),
  };
}

export async function getTopicPage(locale: Locale, slug: string): Promise<TopicPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.topic(slug));
  return publicRead("topic.load", (tx) => loadTopicPage(tx, locale, slug), { locale, slug });
}

// ---------------------------------------------------------------------------
// Slugs for static generation and the sitemap
// ---------------------------------------------------------------------------

type SlugRow = { slug: string; updated_at: Date };
const toSlugs = (rows: SlugRow[]) => rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at.toISOString() }));

/** Published people, most covered first. */
export async function getPublishedPeopleSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.timeline);
  return toSlugs(
    await publicRead(
      "person.slugs",
      (tx) => tx<SlugRow[]>`
      select slug, updated_at from public.people where status = 'published' order by sitelinks desc nulls last, slug`,
    ),
  );
}

export async function getPublishedTopicSlugs(): Promise<{ slug: string; kind: TopicKind; updatedAt: string }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.timeline);
  const rows = await publicRead(
    "topic.slugs",
    (tx) =>
      tx<(SlugRow & { kind: TopicKind })[]>`
      select slug, kind, updated_at from public.topics where status = 'published' order by start_year, slug`,
  );
  return rows.map((r) => ({ slug: r.slug, kind: r.kind, updatedAt: r.updated_at.toISOString() }));
}
