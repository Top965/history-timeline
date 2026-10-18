import Link from "next/link";
import type { MemberSource, TimelineData, TimelineEvent, TopicLink, TopicPage } from "@/lib/content/types";
import { formatEventYears, formatRange } from "@/lib/format/years";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { PersonChip } from "@/components/people/PersonChip";
import { FocusTimeline } from "@/components/timeline/FocusTimeline";
import { WikipediaCredit } from "@/components/ui/WikipediaCredit";

const H2 = "m-0 mt-2 font-display text-2xl font-medium";

/** "Source: Wikidata (citizenship)", linking to the statement on the member's Wikidata page. */
function SourceLink({ locale, source }: { locale: Locale; source: MemberSource | null }) {
  if (!source) return null;
  const t = getMessages(locale).topic;
  const property = source.via.split(">")[0];
  return (
    <a
      href={`https://www.wikidata.org/wiki/${source.wikidataId}#${property}`}
      className="px-1 text-xs text-muted"
      rel="noopener"
      data-testid="member-source"
    >
      {t.source} ({t.via(source.via)})
    </a>
  );
}

function TopicChips({ locale, topics }: { locale: Locale; topics: TopicLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((tp) => (
        <Link
          key={tp.slug}
          href={`/${locale}/topics/${tp.slug}`}
          className="chip text-ink no-underline hover:border-accent"
        >
          <span dir="auto">{tp.name}</span>
          <span className="chip-range">{formatRange(tp, locale)}</span>
        </Link>
      ))}
    </div>
  );
}

export function TopicView({ locale, page, data }: { locale: Locale; page: TopicPage; data: TimelineData }) {
  const t = getMessages(locale);
  const { topic } = page;
  const isGroup = topic.kind !== "topic";
  const end = topic.endYear ?? data.currentYear;
  const own = new Set(topic.eventSlugs);
  // The page carries every event of the topic; the shared timeline data only the biggest.
  const events: TimelineEvent[] = page.events.map((e) => ({ ...e, keywords: [] }));
  const context = data.events.filter(
    (e) => e.importance === 1 && !own.has(e.slug) && e.startYear >= topic.startYear && e.startYear <= end,
  );

  return (
    <article
      className="gutter mx-auto grid max-w-[760px] grid-cols-[minmax(0,1fr)] gap-[22px] pt-6 pb-[60px]"
      aria-labelledby="topic-name"
    >
      <header className="grid gap-2">
        <div className="text-xs font-semibold tracking-[.08em] text-accent uppercase">
          {t.topic.kinds[topic.kind]} · {formatRange(topic, locale)}
        </div>
        <h1
          id="topic-name"
          dir="auto"
          className="m-0 font-display text-[clamp(34px,8vw,52px)] leading-[1.04] font-bold text-balance"
        >
          {topic.name}
        </h1>
        <p className="m-0 font-mono text-sm text-muted">{t.topic.eventCount(page.eventTotal)}</p>
        {topic.summary && (
          <p className="m-0 max-w-[65ch] text-lg text-muted" lang={topic.summaryLocale} dir="auto">
            {topic.summary}
          </p>
        )}
        <WikipediaCredit locale={locale} source={page.source} />
        {topic.isSensitive && (
          <p className="m-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted" role="note">
            {t.topic.sensitive}
          </p>
        )}
        {isGroup && (
          <p className="m-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted" role="note">
            {t.topic.groupNote}
          </p>
        )}
      </header>

      <FocusTimeline
        locale={locale}
        eras={data.eras}
        currentYear={data.currentYear}
        startYear={topic.startYear}
        endYear={topic.endYear}
        events={events}
        context={context}
      />

      {page.successors.length > 0 && (
        <section aria-labelledby="successors-heading" className="grid gap-2.5">
          <h2 id="successors-heading" className={H2}>
            {t.topic.successors}
          </h2>
          <TopicChips locale={locale} topics={page.successors} />
        </section>
      )}
      {page.predecessors.length > 0 && (
        <section aria-labelledby="predecessors-heading" className="grid gap-2.5">
          <h2 id="predecessors-heading" className={H2}>
            {t.topic.predecessors}
          </h2>
          <TopicChips locale={locale} topics={page.predecessors} />
        </section>
      )}

      {page.people.length > 0 && (
        <section aria-labelledby="people-heading" className="grid gap-2.5">
          <h2 id="people-heading" className={H2}>
            {t.topic.people}
          </h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5 p-0">
            {page.people.map((p) => (
              <li key={p.slug} className="grid min-w-0 gap-0.5">
                <PersonChip locale={locale} person={p} />
                <SourceLink locale={locale} source={p.source} />
              </li>
            ))}
          </ul>
          {page.peopleTotal > page.people.length && (
            <p className="m-0 text-sm text-muted">{t.topic.peopleShownOf(page.people.length, page.peopleTotal)}</p>
          )}
        </section>
      )}

      <section aria-labelledby="events-heading" className="grid gap-2.5">
        <h2 id="events-heading" className={H2}>
          {t.topic.events}
        </h2>
        {page.eventTotal > page.events.length && (
          <p className="m-0 text-sm text-muted">{t.topic.shownOf(page.events.length, page.eventTotal)}</p>
        )}
        {page.events.length ? (
          <ol className="m-0 grid list-none gap-2.5 p-0" data-testid="topic-events">
            {page.events.map((e) => (
              <li key={e.slug} className="grid min-w-0 gap-0.5">
                <Link
                  href={`/${locale}/events/${e.slug}`}
                  className="grid gap-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-ink no-underline hover:border-accent"
                >
                  <span className="font-mono text-xs text-muted tabular-nums">{formatEventYears(e, locale)}</span>
                  <span
                    className={e.importance === 1 ? "text-lg font-bold" : "font-semibold"}
                    lang={e.textLocale}
                    dir="auto"
                  >
                    {e.title}
                    {e.hasFullStory && (
                      <span
                        lang={locale}
                        className="ms-2 rounded border border-accent px-[5px] py-px align-[2px] text-[10px] font-semibold tracking-[.06em] text-accent uppercase"
                      >
                        {t.around.fullStory}
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] text-muted" lang={e.textLocale} dir="auto">
                    {e.place}
                  </span>
                  <span className="line-clamp-3 text-sm" lang={e.textLocale} dir="auto">
                    {e.summary}
                  </span>
                </Link>
                <SourceLink locale={locale} source={e.source} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">{t.topic.empty}</p>
        )}
      </section>
    </article>
  );
}
