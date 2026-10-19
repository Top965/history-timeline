-- The is_published_* helpers that the reading policies call no longer run with the
-- owner's rights. They run as the reader, so they see only what the reader's own
-- policies already allow: published events, people, topics and stories. A reader
-- calling them directly learns nothing more than a plain select would show.
--
-- EXECUTE stays granted: policies are evaluated as the reader, so revoking it would
-- break every policy that calls them.

-- As the reader, is_published_story reads public.stories, whose own policy called
-- is_published_story: that would loop. The stories policy checks the row directly.
alter policy "Published stories are public" on public.stories
  using (status = 'published' and public.is_published_event(event_id));

alter function public.is_published_event(uuid) security invoker;
alter function public.is_published_person(uuid) security invoker;
alter function public.is_published_topic(uuid) security invoker;
alter function public.is_published_story(uuid) security invoker;
