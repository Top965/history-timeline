-- Core content: eras, events, topics, images, sources and stories.
--
-- Conventions
--   * Years are historical years: negative = BCE, positive = CE, there is no year 0.
--   * Translatable text lives in *_translations tables keyed by (parent, locale).
--   * Only rows with status = 'published' are visible to the public (see RLS migration).

create extension if not exists pgcrypto;

create domain public.locale_code as text
  check (value ~ '^[a-z]{2,3}$');

create domain public.historical_year as integer
  check (value <> 0 and value between -100000 and 3000);

create type public.content_status as enum ('draft', 'in_review', 'published', 'archived');

create or replace function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Eras
-- ---------------------------------------------------------------------------
create table public.eras (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  start_year   public.historical_year not null,
  end_year     public.historical_year,            -- null = continues to today
  color_token  text not null check (color_token ~ '^--[a-z0-9-]+$'),
  sort_order   integer not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_year is null or end_year > start_year)
);

create table public.era_translations (
  era_id    uuid not null references public.eras (id) on delete cascade,
  locale    public.locale_code not null,
  name      text not null check (length(name) between 1 and 80),
  keywords  text[] not null default '{}',
  primary key (era_id, locale)
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  start_year      public.historical_year not null,
  end_year        public.historical_year,
  start_date      date,                            -- exact day when known
  end_date        date,
  is_approximate  boolean not null default false,  -- "c." dates
  importance      smallint not null check (importance between 1 and 3), -- 1 = world-defining
  latitude        numeric(9, 6) check (latitude between -90 and 90),
  longitude       numeric(9, 6) check (longitude between -180 and 180),
  wikidata_id     text unique check (wikidata_id ~ '^Q[1-9][0-9]*$'),
  status          public.content_status not null default 'draft',
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_year is null or end_year >= start_year),
  check (end_date is null or start_date is not null),
  check (end_date is null or end_date >= start_date),
  check ((latitude is null) = (longitude is null)),
  check (status <> 'published' or published_at is not null)
);

create index events_start_year_idx on public.events (start_year);
create index events_status_idx on public.events (status);

create table public.event_translations (
  event_id     uuid not null references public.events (id) on delete cascade,
  locale       public.locale_code not null,
  title        text not null check (length(title) between 1 and 200),
  summary      text not null check (length(summary) between 1 and 2000),
  place_label  text not null check (length(place_label) between 1 and 200),
  -- What the hero image should show. Used as the caption until a Commons image is attached.
  media_hint   text,
  keywords     text[] not null default '{}',
  primary key (event_id, locale)
);

-- ---------------------------------------------------------------------------
-- Topics (curated ranges such as "Ancient Egypt" or "FIFA World Cup")
-- ---------------------------------------------------------------------------
create table public.topics (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  start_year      public.historical_year not null,
  end_year        public.historical_year,          -- null = ongoing
  is_approximate  boolean not null default false,
  wikidata_id     text unique check (wikidata_id ~ '^Q[1-9][0-9]*$'),
  status          public.content_status not null default 'draft',
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_year is null or end_year >= start_year),
  check (status <> 'published' or published_at is not null)
);

create table public.topic_translations (
  topic_id  uuid not null references public.topics (id) on delete cascade,
  locale    public.locale_code not null,
  name      text not null check (length(name) between 1 and 120),
  summary   text check (length(summary) between 1 and 2000),  -- null = not translated yet, falls back to English
  keywords  text[] not null default '{}',
  primary key (topic_id, locale)
);

create table public.topic_events (
  topic_id    uuid not null references public.topics (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  sort_order  integer not null default 0,
  primary key (topic_id, event_id)
);

create index topic_events_event_idx on public.topic_events (event_id);

-- ---------------------------------------------------------------------------
-- Images (Wikimedia Commons only; loaded straight from Commons thumbnails)
-- ---------------------------------------------------------------------------
create table public.images (
  id                    uuid primary key default gen_random_uuid(),
  commons_file          text not null unique check (commons_file ~ '^File:.+'),
  file_page_url         text not null check (file_page_url ~ '^https://commons\.wikimedia\.org/'),
  original_url          text not null check (original_url ~ '^https://upload\.wikimedia\.org/'),
  width                 integer not null check (width > 0),
  height                integer not null check (height > 0),
  mime_type             text not null check (mime_type ~ '^image/'),
  license_short_name    text not null,               -- e.g. "CC BY-SA 4.0", "Public domain"
  license_url           text,
  author_text           text not null,               -- plain-text author for the credit line
  author_url            text,
  credit_text           text,
  attribution_required  boolean not null,
  -- Non-free files are never stored. The import script rejects them; this is the backstop.
  is_free               boolean not null check (is_free),
  retrieved_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.image_translations (
  image_id  uuid not null references public.images (id) on delete cascade,
  locale    public.locale_code not null,
  caption   text not null,
  alt_text  text not null,
  primary key (image_id, locale)
);

create type public.event_image_role as enum ('hero', 'gallery');

create table public.event_images (
  event_id    uuid not null references public.events (id) on delete cascade,
  image_id    uuid not null references public.images (id) on delete restrict,
  role        public.event_image_role not null default 'gallery',
  sort_order  integer not null default 0,
  primary key (event_id, image_id)
);

create unique index event_images_one_hero_idx on public.event_images (event_id) where role = 'hero';

-- ---------------------------------------------------------------------------
-- Sources (needed for Wikipedia CC BY-SA credit and for review)
-- ---------------------------------------------------------------------------
create type public.source_kind as enum ('wikipedia', 'wikidata', 'commons', 'book', 'article', 'web', 'other');

create table public.sources (
  id            uuid primary key default gen_random_uuid(),
  kind          public.source_kind not null,
  url           text check (url ~ '^https?://'),
  title         text not null,
  locale        public.locale_code,
  license       text,                    -- e.g. "CC BY-SA 4.0"
  revision_id   bigint,                  -- Wikipedia/Wikidata revision the text was drawn from
  retrieved_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (url, revision_id)
);

create table public.event_sources (
  event_id   uuid not null references public.events (id) on delete cascade,
  source_id  uuid not null references public.sources (id) on delete cascade,
  primary key (event_id, source_id)
);

-- ---------------------------------------------------------------------------
-- Stories (long-form event pages, drafted then reviewed before publishing)
-- ---------------------------------------------------------------------------
create type public.story_layout as enum ('short', 'full');

create table public.stories (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  locale        public.locale_code not null,
  layout        public.story_layout not null default 'full',
  dek           text,                     -- standfirst under the title; falls back to event summary
  footnote      text,                     -- e.g. "Figures are historians' estimates..."
  status        public.content_status not null default 'draft',
  drafted_by    text not null default 'human' check (drafted_by in ('human', 'claude')),
  draft_model   text,
  reviewed_by   uuid,                     -- references profiles(id), added with accounts
  reviewed_at   timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (event_id, locale),
  check (status <> 'published' or published_at is not null)
);

create table public.story_sources (
  story_id   uuid not null references public.stories (id) on delete cascade,
  source_id  uuid not null references public.sources (id) on delete cascade,
  primary key (story_id, source_id)
);

create table public.story_stats (
  story_id     uuid not null references public.stories (id) on delete cascade,
  sort_order   integer not null,
  value_label  text not null,             -- "≈65M"
  description  text not null,             -- "soldiers mobilized"
  primary key (story_id, sort_order)
);

create type public.figure_kind as enum ('photo', 'map');

create table public.story_chapters (
  story_id        uuid not null references public.stories (id) on delete cascade,
  sort_order      integer not null check (sort_order > 0),
  title           text not null,
  period_label    text not null,          -- "July – November 1914"
  paragraphs      text[] not null check (cardinality(paragraphs) > 0),
  figure_kind     public.figure_kind,
  figure_caption  text,
  image_id        uuid references public.images (id) on delete set null,
  shows_sides     boolean not null default false,
  primary key (story_id, sort_order)
);

create table public.story_key_dates (
  story_id       uuid not null references public.stories (id) on delete cascade,
  sort_order     integer not null,
  date           date not null,
  label          text not null,
  chapter_order  integer,                 -- chapter the date jumps to
  primary key (story_id, sort_order),
  foreign key (story_id, chapter_order) references public.story_chapters (story_id, sort_order)
);

create table public.story_sides (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references public.stories (id) on delete cascade,
  sort_order  integer not null,
  name        text not null,
  unique (story_id, sort_order)
);

create table public.story_side_members (
  side_id     uuid not null references public.story_sides (id) on delete cascade,
  sort_order  integer not null,
  name        text not null,
  note        text,                       -- "from 1917"
  primary key (side_id, sort_order)
);

create table public.story_people (
  story_id     uuid not null references public.stories (id) on delete cascade,
  sort_order   integer not null,
  name         text not null,
  description  text not null,
  initials     text not null check (length(initials) between 1 and 3),
  wikidata_id  text check (wikidata_id ~ '^Q[1-9][0-9]*$'),
  image_id     uuid references public.images (id) on delete set null,
  primary key (story_id, sort_order)
);

create table public.story_related (
  story_id          uuid not null references public.stories (id) on delete cascade,
  related_event_id  uuid not null references public.events (id) on delete cascade,
  sort_order        integer not null,
  primary key (story_id, related_event_id)
);

-- updated_at triggers
create trigger eras_updated_at before update on public.eras
  for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger topics_updated_at before update on public.topics
  for each row execute function public.set_updated_at();
create trigger images_updated_at before update on public.images
  for each row execute function public.set_updated_at();
create trigger stories_updated_at before update on public.stories
  for each row execute function public.set_updated_at();
