-- "Look up anyone": visitors can add a person from Wikidata through search (step 3).

-- How a person got onto the site, so pages added from search can be reviewed or hidden.
create type public.person_origin as enum ('import', 'search');
alter table public.people add column added_via public.person_origin not null default 'import';
create index people_added_via_idx on public.people (added_via) where added_via = 'search';

-- Gaps and disagreements the importer found in a person's data, shown on their page
-- so readers know what is missing (see scripts/import/checks.ts for the list).
alter table public.people add column data_notes text[] not null default '{}';

-- One row per person added from search, for rate limits and review.
-- `client_hash` is a salted hash of the visitor's IP address, never the address itself.
create table public.person_requests (
  id           bigint generated always as identity primary key,
  client_hash  text not null,
  wikidata_id  text not null check (wikidata_id ~ '^Q[1-9][0-9]*$'),
  person_id    uuid references public.people (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index person_requests_client_idx on public.person_requests (client_hash, created_at desc);
create index person_requests_created_idx on public.person_requests (created_at desc);

-- Only the server writes or reads this table; visitors never see it.
alter table public.person_requests enable row level security;
revoke all on public.person_requests from anon, authenticated;
revoke all on sequence public.person_requests_id_seq from anon, authenticated;

-- People whose recorded dates can't be right (a lifespan over 122 years, the verified
-- maximum) go back to review instead of showing a wrong timeline. The importer now
-- refuses such dates too (scripts/import/checks.ts). Imported people only.
update public.people
set status = 'in_review'
where status = 'published'
  and added_via = 'import'
  and coalesce(death_year, extract(year from now())::int) - birth_year > 122;
