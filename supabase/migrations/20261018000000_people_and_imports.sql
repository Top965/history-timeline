-- People with their own life timelines, and bookkeeping for content imported
-- from Wikidata, Wikipedia and Wikimedia Commons (step 2).

-- Where a piece of text came from. The importer only ever rewrites text it wrote
-- itself ('wikipedia' / 'wikidata'); hand-written text ('manual') is never touched.
create type public.text_origin as enum ('manual', 'wikidata', 'wikipedia');

alter table public.event_translations
  add column origin public.text_origin not null default 'manual',
  add column source_id uuid references public.sources (id) on delete set null;

alter table public.topic_translations
  add column origin public.text_origin not null default 'manual',
  add column source_id uuid references public.sources (id) on delete set null;

-- Wikidata popularity: how many Wikipedia language editions cover the item.
alter table public.events add column sitelinks integer check (sitelinks >= 0);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.people (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  wikidata_id     text unique check (wikidata_id ~ '^Q[1-9][0-9]*$'),
  birth_year      public.historical_year,
  death_year      public.historical_year,              -- null = alive or unknown
  birth_date      date,
  death_date      date,
  is_approximate  boolean not null default false,
  sitelinks       integer check (sitelinks >= 0),
  image_id        uuid references public.images (id) on delete set null,
  status          public.content_status not null default 'draft',
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (death_year is null or birth_year is null or death_year >= birth_year),
  check (status <> 'published' or published_at is not null),
  check (status <> 'published' or birth_year is not null)
);

create index people_birth_year_idx on public.people (birth_year);

create table public.person_translations (
  person_id     uuid not null references public.people (id) on delete cascade,
  locale        public.locale_code not null,
  name          text not null check (length(name) between 1 and 200),
  description   text check (length(description) between 1 and 300),   -- "President of Iraq (1979–2003)"
  biography     text check (length(biography) between 1 and 6000),    -- Wikipedia lead section
  birth_place   text,
  death_place   text,
  keywords      text[] not null default '{}',
  origin        public.text_origin not null default 'manual',
  source_id     uuid references public.sources (id) on delete set null,
  primary key (person_id, locale)
);

-- One row per entry on a person's life timeline.
create type public.life_event_kind as enum ('birth', 'death', 'position', 'conflict', 'team', 'award', 'event');

create table public.person_events (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.people (id) on delete cascade,
  kind            public.life_event_kind not null,
  start_year      public.historical_year not null,
  end_year        public.historical_year,
  start_date      date,
  end_date        date,
  is_approximate  boolean not null default false,
  wikidata_id     text check (wikidata_id ~ '^Q[1-9][0-9]*$'),  -- the office, war, team or award
  event_id        uuid references public.events (id) on delete set null,  -- when it is also an event on the site
  check (end_year is null or end_year >= start_year)
);

create index person_events_person_idx on public.person_events (person_id, start_year);
create index person_events_event_idx on public.person_events (event_id);
create unique index person_events_unique_idx
  on public.person_events (person_id, kind, coalesce(wikidata_id, ''), start_year);

create table public.person_event_translations (
  person_event_id  uuid not null references public.person_events (id) on delete cascade,
  locale           public.locale_code not null,
  label            text not null check (length(label) between 1 and 300),
  primary key (person_event_id, locale)
);

create table public.topic_people (
  topic_id    uuid not null references public.topics (id) on delete cascade,
  person_id   uuid not null references public.people (id) on delete cascade,
  sort_order  integer not null default 0,
  primary key (topic_id, person_id)
);

create index topic_people_person_idx on public.topic_people (person_id);

create trigger people_updated_at before update on public.people
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access: the public reads published people only; nobody but the owner writes.
-- ---------------------------------------------------------------------------
alter table public.people enable row level security;
alter table public.person_translations enable row level security;
alter table public.person_events enable row level security;
alter table public.person_event_translations enable row level security;
alter table public.topic_people enable row level security;

create or replace function public.is_published_person(p_person_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.people p where p.id = p_person_id and p.status = 'published');
$$;

revoke all on function public.is_published_person(uuid) from public;
grant execute on function public.is_published_person(uuid) to anon, authenticated;

create policy "Published people are public" on public.people
  for select to anon, authenticated using (status = 'published');
create policy "Published person text is public" on public.person_translations
  for select to anon, authenticated using (public.is_published_person(person_id));
create policy "Published life events are public" on public.person_events
  for select to anon, authenticated using (public.is_published_person(person_id));
create policy "Published life event text is public" on public.person_event_translations
  for select to anon, authenticated
  using (exists (select 1 from public.person_events pe
                 where pe.id = person_event_id and public.is_published_person(pe.person_id)));
create policy "Published topic people are public" on public.topic_people
  for select to anon, authenticated
  using (public.is_published_topic(topic_id) and public.is_published_person(person_id));

-- Hosted Supabase grants every privilege on new public tables; take back all but reading.
revoke all on
  public.people, public.person_translations, public.person_events,
  public.person_event_translations, public.topic_people
from anon, authenticated;
grant select on
  public.people, public.person_translations, public.person_events,
  public.person_event_translations, public.topic_people
to anon, authenticated;
