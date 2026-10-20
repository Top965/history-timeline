import Link from "next/link";
import type { EventLink, EventPage } from "@/lib/content/types";
import { commonsThumbUrl } from "@/lib/commons/thumbnails";
import { formatDate, formatDateRange, formatEventYears, formatRange } from "@/lib/format/years";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { PersonChip } from "@/components/people/PersonChip";
import { ArticleSections } from "@/components/people/WikiProfile";
import { SourceList, WikipediaCredit } from "@/components/ui/WikipediaCredit";
import { CommonsFigure } from "./CommonsFigure";
import { ShowOnTimeline } from "./ShowOnTimeline";

const H3 = "m-0 mt-2 font-display text-2xl font-medium";

function RelatedChip({ locale, link }: { locale: Locale; link: EventLink }) {
  return (
    <Link href={`/${locale}/events/${link.slug}`} className="chip text-ink no-underline hover:border-accent">
      <span dir="auto">{link.title}</span>
      <span className="chip-range">{formatEventYears(link, locale)}</span>
    </Link>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold tracking-[.08em] text-accent uppercase">{children}</div>;
}

function Title({ children, lang }: { children: React.ReactNode; lang: Locale }) {
  return (
    <h1
      id="story-title"
      lang={lang}
      dir="auto"
      className="m-0 mt-1.5 mb-2.5 font-display text-[clamp(36px,8vw,56px)] leading-[1.02] font-bold text-balance"
    >
      {children}
    </h1>
  );
}

export function StoryView({ locale, page }: { locale: Locale; page: EventPage }) {
  const t = getMessages(locale);
  const { event, story } = page;
  const eraLabel = page.era ? t.readout.era(page.era.name) : "";
  const contentLocale = story?.locale ?? event.textLocale;
  const translatedNotice = contentLocale !== locale && t.story.notTranslated;

  return (
    <article
      className="gutter mx-auto grid max-w-[760px] grid-cols-[minmax(0,1fr)] gap-[22px] pt-6 pb-[60px]"
      aria-labelledby="story-title"
    >
      {translatedNotice && (
        <p className="m-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted" role="note">
          {translatedNotice}
        </p>
      )}
      {story?.layout === "full" ? (
        <FullStory locale={locale} page={page} eraLabel={eraLabel} />
      ) : (
        <ShortStory locale={locale} page={page} eraLabel={eraLabel} />
      )}
    </article>
  );
}

function ShortStory({ locale, page, eraLabel }: { locale: Locale; page: EventPage; eraLabel: string }) {
  const t = getMessages(locale);
  const { event } = page;
  const when = formatEventYears(event, locale);
  return (
    <>
      <div lang={event.textLocale}>
        <Eyebrow>
          <span lang={locale}>{eraLabel}</span> · {when}
        </Eyebrow>
        <Title lang={event.textLocale}>{event.title}</Title>
        <p className="m-0 max-w-[60ch] text-lg text-muted" dir="auto">
          {event.summary}
        </p>
      </div>
      <CommonsFigure
        locale={locale}
        kind="photo"
        caption={event.mediaHint ?? event.title}
        captionLocale={event.textLocale}
        image={page.hero}
        priority
      />
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">{t.story.when}</dt>
        <dd className="m-0">{event.startDate ? formatDateRange(event.startDate, event.endDate, locale) : when}</dd>
        <dt className="text-muted">{t.story.where}</dt>
        <dd className="m-0" lang={event.textLocale} dir="auto">
          {event.place}
        </dd>
        <dt className="text-muted">{t.story.era}</dt>
        <dd className="m-0">{page.era?.name}</dd>
      </dl>
      {event.wikidataId && <ArticleSections wikidataId={event.wikidataId} locale={locale} withLead />}
      <Connections locale={locale} page={page} />
      <h2 className={H3}>{t.story.beforeAndAfter}</h2>
      <div className="flex flex-wrap gap-2">
        {page.previous && <RelatedChip locale={locale} link={page.previous} />}
        {page.next && <RelatedChip locale={locale} link={page.next} />}
        <ShowOnTimeline locale={locale} year={event.startYear} />
      </div>
      {page.source ? (
        <WikipediaCredit locale={locale} source={page.source} />
      ) : (
        <>
          <SourceList locale={locale} sources={page.sources} />
          <p className="note">{t.story.shortNote}</p>
        </>
      )}
    </>
  );
}

/** The topics this event is part of and the people who took part. */
function Connections({ locale, page }: { locale: Locale; page: EventPage }) {
  const t = getMessages(locale);
  if (!page.topics.length && !page.people.length) return null;
  return (
    <>
      {page.topics.length > 0 && (
        <>
          <h2 className={H3}>{t.related.topics}</h2>
          <div className="flex flex-wrap gap-2">
            {page.topics.map((tp) => (
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
        </>
      )}
      {page.people.length > 0 && (
        <>
          <h2 className={H3}>{t.related.people}</h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5 p-0">
            {page.people.map((p) => (
              <li key={p.slug} className="min-w-0">
                <PersonChip locale={locale} person={p} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function FullStory({ locale, page, eraLabel }: { locale: Locale; page: EventPage; eraLabel: string }) {
  const t = getMessages(locale);
  const { event } = page;
  const story = page.story!;
  const lang = story.locale;
  const dates = event.startDate
    ? formatDateRange(event.startDate, event.endDate, locale)
    : formatEventYears(event, locale);
  const sides = story.sides;

  return (
    <>
      <div>
        <Eyebrow>
          {eraLabel} · {dates}
        </Eyebrow>
        <Title lang={event.textLocale}>{event.title}</Title>
        <p className="m-0 max-w-[60ch] text-lg text-muted" lang={lang} dir="auto">
          {story.dek ?? event.summary}
        </p>
      </div>

      <CommonsFigure
        locale={locale}
        kind="photo"
        caption={event.mediaHint ?? event.title}
        captionLocale={lang}
        image={page.hero}
        priority
      />

      {story.stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" lang={lang}>
          {story.stats.map((s) => (
            <div key={s.value + s.description} className="border-t-2 border-accent pt-2">
              <b className="block font-mono text-[26px] font-medium tabular-nums">{s.value}</b>
              <span className="text-[13px] text-muted">{s.description}</span>
            </div>
          ))}
        </div>
      )}

      {story.keyDates.length > 0 && (
        <section aria-labelledby="key-dates" className="min-w-0">
          <h2 id="key-dates" className={H3}>
            {t.story.keyDates}
          </h2>
          <p className="mt-1 mb-2.5 text-[13px] text-muted">{t.story.tapDate}</p>
          <ol className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1.5" lang={lang}>
            {story.keyDates.map((d) => (
              <li key={d.date + d.label} className="flex-none">
                <a
                  href={d.chapter ? `#chapter-${d.chapter}` : undefined}
                  className="block w-[150px] rounded-[10px] border border-line bg-surface px-3 py-2.5 text-start text-ink no-underline hover:border-accent"
                >
                  <b className="block font-mono text-xs font-medium text-accent" lang={locale}>
                    {formatDate(d.date, locale)}
                  </b>
                  <span className="text-[13px]">{d.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      {story.chapters.map((c) => (
        <section
          key={c.order}
          id={`chapter-${c.order}`}
          className="grid scroll-mt-[70px] gap-2.5"
          aria-labelledby={`chapter-${c.order}-title`}
        >
          <div className="font-mono text-xs text-muted">{t.story.chapterOf(c.order, story.chapters.length)}</div>
          <h2
            id={`chapter-${c.order}-title`}
            className="m-0 font-display text-[28px] leading-[1.1] font-bold text-balance"
            lang={lang}
            dir="auto"
          >
            {c.title}
          </h2>
          <div className="font-mono text-xs text-accent" lang={lang}>
            {c.period}
          </div>
          {c.paragraphs.map((p, i) => (
            <p key={i} className="m-0 max-w-[65ch]" lang={lang} dir="auto">
              {p}
            </p>
          ))}
          {c.figure && (
            <CommonsFigure
              locale={locale}
              kind={c.figure.kind}
              caption={c.figure.caption}
              captionLocale={lang}
              image={c.figure.image}
            />
          )}
          {c.showsSides && sides.length > 0 && (
            <div className="grid grid-cols-1 gap-2.5 min-[481px]:grid-cols-2" lang={lang}>
              {sides.map((s) => (
                <div key={s.name} className="rounded-xl border border-line bg-surface p-3.5">
                  <h3 className="m-0 mb-2 text-xs tracking-[.08em] uppercase">{s.name}</h3>
                  <ul className="m-0 grid list-none gap-1 p-0 text-sm">
                    {s.members.map((m) => (
                      <li key={m.name}>
                        {m.name}
                        {m.note && <small className="ms-1.5 font-mono text-[11px] text-muted">{m.note}</small>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {story.people.length > 0 && (
        <section aria-labelledby="key-people">
          <h2 id="key-people" className={H3}>
            {t.story.keyPeople}
          </h2>
          <ul
            className="m-0 mt-3 grid list-none grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5 p-0"
            lang={lang}
          >
            {story.people.map((p) => (
              <li key={p.name} className="flex min-w-0 items-start gap-2.5">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={commonsThumbUrl(p.image, 330)}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                    className="size-11 flex-none rounded-full border border-line object-cover"
                  />
                ) : (
                  <div
                    className="grid size-11 flex-none place-items-center rounded-full border border-line bg-accent-soft font-display text-base font-bold text-accent-strong"
                    aria-hidden="true"
                  >
                    {p.initials}
                  </div>
                )}
                <div>
                  <b className="block text-sm">{p.name}</b>
                  <span className="text-[13px] text-muted">{p.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="led-to">
        <h2 id="led-to" className={H3}>
          {t.story.whatItLedTo}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {story.related.map((r) => (
            <RelatedChip key={r.slug} locale={locale} link={r} />
          ))}
          <ShowOnTimeline locale={locale} year={event.startYear} />
        </div>
      </section>

      <Connections locale={locale} page={page} />

      <p className="note">
        {story.footnote && (
          <>
            <span lang={lang}>{story.footnote}</span>{" "}
          </>
        )}
        {t.story.reviewNote}
      </p>
    </>
  );
}
