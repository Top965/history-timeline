-- Placeholders for later build steps: accounts (step 7), premium + payments (step 7),
-- schools, favorites and user contributions. Tables exist so later steps only add
-- columns and UI; nothing here is exposed publicly.

create type public.profile_role as enum ('user', 'moderator', 'admin');

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text check (length(display_name) between 1 and 80),
  avatar_url        text,
  country_code      text check (country_code ~ '^[A-Z]{2}$'),
  preferred_locale  public.locale_code,
  role              public.profile_role not null default 'user',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.stories
  add constraint stories_reviewed_by_fkey foreign key (reviewed_by)
  references public.profiles (id) on delete set null;

-- Premium (Paddle is merchant of record; schools pay by invoice)
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'canceled');

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  profile_id                uuid references public.profiles (id) on delete set null,
  organization_id           uuid,
  provider                  text not null default 'paddle' check (provider in ('paddle', 'invoice')),
  provider_customer_id      text,
  provider_subscription_id  text unique,
  plan                      text not null,
  status                    public.subscription_status not null,
  current_period_end        timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check ((profile_id is null) <> (organization_id is null))
);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Schools, universities and partners
create type public.organization_kind as enum ('school', 'university', 'partner');

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          public.organization_kind not null,
  country_code  text check (country_code ~ '^[A-Z]{2}$'),
  created_at    timestamptz not null default now()
);

alter table public.subscriptions
  add constraint subscriptions_organization_fkey foreign key (organization_id)
  references public.organizations (id) on delete cascade;

create table public.organization_members (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  role             text not null default 'member' check (role in ('member', 'teacher', 'admin')),
  primary key (organization_id, profile_id)
);

create table public.classrooms (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null,
  teacher_id       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

create table public.classroom_members (
  classroom_id  uuid not null references public.classrooms (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  primary key (classroom_id, profile_id)
);

-- Favorites
create table public.favorites (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, event_id)
);

-- User contributions: nothing goes live without review.
create type public.contribution_kind as enum ('new_event', 'correction', 'story');
create type public.contribution_status as enum ('submitted', 'ai_checked', 'approved', 'rejected');

create table public.contributions (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references public.profiles (id) on delete cascade,
  kind                 public.contribution_kind not null,
  target_event_id      uuid references public.events (id) on delete set null,
  locale               public.locale_code not null,
  title                text not null check (length(title) between 3 and 200),
  body                 text not null check (length(body) between 10 and 20000),
  -- Date, place and source are required for every submission.
  start_year           public.historical_year not null,
  end_year             public.historical_year,
  place_label          text not null check (length(place_label) between 1 and 200),
  source_description   text not null check (length(source_description) between 3 and 2000),
  source_url           text check (source_url ~ '^https?://'),
  is_personal_account  boolean not null default false,  -- family/oral stories, labelled "Personal account"
  status               public.contribution_status not null default 'submitted',
  ai_check             jsonb,                            -- Claude pre-check result
  moderator_id         uuid references public.profiles (id) on delete set null,
  moderated_at         timestamptz,
  moderator_note       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (end_year is null or end_year >= start_year),
  check (kind <> 'correction' or target_event_id is not null)
);

create index contributions_status_idx on public.contributions (status);

create trigger contributions_updated_at before update on public.contributions
  for each row execute function public.set_updated_at();

-- Topics where only suggestions are accepted (wars, religion, conflicts)
alter table public.topics add column is_sensitive boolean not null default false;

-- Contributor credit and motivation (no cash rewards)
create table public.contributor_stats (
  profile_id         uuid primary key references public.profiles (id) on delete cascade,
  points             integer not null default 0 check (points >= 0),
  level              integer not null default 1 check (level >= 1),
  approved_count     integer not null default 0,
  updated_at         timestamptz not null default now()
);

create table public.badges (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text not null
);

create table public.profile_badges (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  badge_id    uuid not null references public.badges (id) on delete cascade,
  awarded_at  timestamptz not null default now(),
  primary key (profile_id, badge_id)
);
