-- Row Level Security.
-- The website reads as the `anon` role (the app sets it per transaction), so these
-- policies are what decide what the public can see: published content only.

-- Content tables -------------------------------------------------------------
alter table public.eras enable row level security;
alter table public.era_translations enable row level security;
alter table public.events enable row level security;
alter table public.event_translations enable row level security;
alter table public.topics enable row level security;
alter table public.topic_translations enable row level security;
alter table public.topic_events enable row level security;
alter table public.images enable row level security;
alter table public.image_translations enable row level security;
alter table public.event_images enable row level security;
alter table public.sources enable row level security;
alter table public.event_sources enable row level security;
alter table public.stories enable row level security;
alter table public.story_sources enable row level security;
alter table public.story_stats enable row level security;
alter table public.story_chapters enable row level security;
alter table public.story_key_dates enable row level security;
alter table public.story_sides enable row level security;
alter table public.story_side_members enable row level security;
alter table public.story_people enable row level security;
alter table public.story_related enable row level security;

create or replace function public.is_published_event(p_event_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = p_event_id and e.status = 'published');
$$;

create or replace function public.is_published_topic(p_topic_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.topics t where t.id = p_topic_id and t.status = 'published');
$$;

create or replace function public.is_published_story(p_story_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.stories s
    join public.events e on e.id = s.event_id
    where s.id = p_story_id and s.status = 'published' and e.status = 'published'
  );
$$;

revoke all on function public.is_published_event(uuid) from public;
revoke all on function public.is_published_topic(uuid) from public;
revoke all on function public.is_published_story(uuid) from public;
grant execute on function public.is_published_event(uuid) to anon, authenticated;
grant execute on function public.is_published_topic(uuid) to anon, authenticated;
grant execute on function public.is_published_story(uuid) to anon, authenticated;

create policy "Eras are public" on public.eras
  for select to anon, authenticated using (true);
create policy "Era names are public" on public.era_translations
  for select to anon, authenticated using (true);

create policy "Published events are public" on public.events
  for select to anon, authenticated using (status = 'published');
create policy "Published event text is public" on public.event_translations
  for select to anon, authenticated using (public.is_published_event(event_id));

create policy "Published topics are public" on public.topics
  for select to anon, authenticated using (status = 'published');
create policy "Published topic text is public" on public.topic_translations
  for select to anon, authenticated using (public.is_published_topic(topic_id));
create policy "Published topic links are public" on public.topic_events
  for select to anon, authenticated
  using (public.is_published_topic(topic_id) and public.is_published_event(event_id));

create policy "Images are public" on public.images
  for select to anon, authenticated using (true);
create policy "Image captions are public" on public.image_translations
  for select to anon, authenticated using (true);
create policy "Images of published events are public" on public.event_images
  for select to anon, authenticated using (public.is_published_event(event_id));

create policy "Sources are public" on public.sources
  for select to anon, authenticated using (true);
create policy "Sources of published events are public" on public.event_sources
  for select to anon, authenticated using (public.is_published_event(event_id));

create policy "Published stories are public" on public.stories
  for select to anon, authenticated using (public.is_published_story(id));
create policy "Published story sources are public" on public.story_sources
  for select to anon, authenticated using (public.is_published_story(story_id));
create policy "Published story stats are public" on public.story_stats
  for select to anon, authenticated using (public.is_published_story(story_id));
create policy "Published story chapters are public" on public.story_chapters
  for select to anon, authenticated using (public.is_published_story(story_id));
create policy "Published story dates are public" on public.story_key_dates
  for select to anon, authenticated using (public.is_published_story(story_id));
create policy "Published story sides are public" on public.story_sides
  for select to anon, authenticated using (public.is_published_story(story_id));
create policy "Published story side members are public" on public.story_side_members
  for select to anon, authenticated
  using (exists (select 1 from public.story_sides s where s.id = side_id and public.is_published_story(s.story_id)));
create policy "Published story people are public" on public.story_people
  for select to anon, authenticated using (public.is_published_story(story_id));
create policy "Published related events are public" on public.story_related
  for select to anon, authenticated
  using (public.is_published_story(story_id) and public.is_published_event(related_event_id));

grant usage on schema public to anon, authenticated;
grant select on
  public.eras, public.era_translations,
  public.events, public.event_translations,
  public.topics, public.topic_translations, public.topic_events,
  public.images, public.image_translations, public.event_images,
  public.sources, public.event_sources,
  public.stories, public.story_sources, public.story_stats, public.story_chapters,
  public.story_key_dates, public.story_sides, public.story_side_members,
  public.story_people, public.story_related
to anon, authenticated;

-- Account tables: private to their owner. No public access at all. ----------
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.favorites enable row level security;
alter table public.contributions enable row level security;
alter table public.contributor_stats enable row level security;
alter table public.badges enable row level security;
alter table public.profile_badges enable row level security;

revoke all on
  public.profiles, public.subscriptions, public.organizations, public.organization_members,
  public.classrooms, public.classroom_members, public.favorites, public.contributions,
  public.contributor_stats, public.badges, public.profile_badges
from anon;

grant select on public.profiles to authenticated;
-- Users may edit their own details but never their role.
grant update (display_name, avatar_url, country_code, preferred_locale) on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert on public.contributions to authenticated;

create policy "Users read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Users update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users read their own subscriptions" on public.subscriptions
  for select to authenticated using (profile_id = (select auth.uid()));

create policy "Users manage their own favorites" on public.favorites
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Users read their own contributions" on public.contributions
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "Users submit contributions for review" on public.contributions
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and status = 'submitted'
    and moderator_id is null
    and moderated_at is null
    and ai_check is null
  );
