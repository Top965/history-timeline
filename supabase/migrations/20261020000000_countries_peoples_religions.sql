-- Countries (today's and former), people groups and religions, each with its own
-- timeline. They are topics of a new kind, so their pages, search and links work
-- like topic pages. The importer fills them from Wikidata.

create type public.topic_kind as enum ('topic', 'country', 'former_country', 'people', 'religion');
alter table public.topics add column kind public.topic_kind not null default 'topic';
create index topics_kind_idx on public.topics (kind);

-- Which Wikidata statement put an event or a person into a country, people group or
-- religion, shown next to it as its source. "P17" = country, "P276>P17" = country of
-- the location, "P19>P17" = country of the birthplace, "P27" = citizenship,
-- "P172" = ethnic group, "P140" = religion. Null for hand-picked topic members.
alter table public.topic_events add column via text check (via ~ '^P[1-9][0-9]*(>P[1-9][0-9]*)?$');
alter table public.topic_people add column via text check (via ~ '^P[1-9][0-9]*(>P[1-9][0-9]*)?$');

-- A former state and the countries that replaced it (Wikidata "replaced by", P1366).
create table public.topic_successors (
  topic_id      uuid not null references public.topics (id) on delete cascade,
  successor_id  uuid not null references public.topics (id) on delete cascade,
  primary key (topic_id, successor_id),
  check (topic_id <> successor_id)
);

create index topic_successors_successor_idx on public.topic_successors (successor_id);

alter table public.topic_successors enable row level security;

create policy "Published topic successors are public" on public.topic_successors
  for select to anon, authenticated
  using (public.is_published_topic(topic_id) and public.is_published_topic(successor_id));

-- Hosted Supabase grants every privilege on new public tables; take back all but reading.
revoke all on public.topic_successors from anon, authenticated;
grant select on public.topic_successors to anon, authenticated;
