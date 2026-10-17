-- Hosted Supabase gives anon and authenticated every privilege on new public tables
-- by default. RLS already blocks writes that have no policy, but grants are the
-- first line: the public only reads content, and users only get the column-level
-- access the RLS migration grants (e.g. never profiles.role).

revoke insert, update, delete, truncate, references, trigger on
  public.eras, public.era_translations,
  public.events, public.event_translations,
  public.topics, public.topic_translations, public.topic_events,
  public.images, public.image_translations, public.event_images,
  public.sources, public.event_sources,
  public.stories, public.story_sources, public.story_stats, public.story_chapters,
  public.story_key_dates, public.story_sides, public.story_side_members,
  public.story_people, public.story_related
from anon, authenticated;

revoke all on
  public.profiles, public.subscriptions, public.organizations, public.organization_members,
  public.classrooms, public.classroom_members, public.favorites, public.contributions,
  public.contributor_stats, public.badges, public.profile_badges
from authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, country_code, preferred_locale) on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert on public.contributions to authenticated;

