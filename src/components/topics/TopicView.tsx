import Link from "next/link";
import type { TimelineData, TopicPage } from "@/lib/content/types";
import { formatEventYears, formatRange } from "@/lib/format/years";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { PersonChip } from "@/components/people/PersonChip";
import { FocusTimeline } from "@/components/timeline/FocusTimeline";
import { WikipediaCredit } from "@/components/ui/WikipediaCredit";

const H2 = "m-0 mt-2 font-display text-2xl font-medium";

export function TopicView({ locale, page, data }: { locale: Locale; page: TopicPage; data: TimelineData }) {
  const t = getMessages(locale);
  const { topic } = page;
  const end = topic.endYear ?? data.currentYear;
  const own = new Set(topic.eventSlugs);
  const events = data.events.filter((e) => own.has(e.slug));
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
          {t.topic.kicker} · {formatRange(topic, locale)}
        </div>
        <h1
          id="topic-name"
          dir="auto"
          className="m-0 font-display text-[clamp(34px,8vw,52px)] leading-[1.04] font-bold text-balance"
        >
          {topic.name}
        </h1>
        <p className="m-0 font-mono text-sm text-muted">{t.topic.eventCount(page.events.length)}</p>
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

      {page.people.length > 0 && (
        <section aria-labelledby="people-heading" className="grid gap-2.5">
          <h2 id="people-heading" className={H2}>
            {t.topic.people}
          </h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5 p-0">
            {page.people.map((p) => (
              <li key={p.slug} className="min-w-0">
                <PersonChip locale={locale} person={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="events-heading" className="grid gap-2.5">
        <h2 id="events-heading" className={H2}>
          {t.topic.events}
        </h2>
        {page.events.length ? (
          <ol className="m-0 grid list-none gap-2.5 p-0" data-testid="topic-events">
            {page.events.map((e) => (
              <li key={e.slug} className="min-w-0">
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
