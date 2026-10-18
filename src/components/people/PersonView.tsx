import Link from "next/link";
import type { LifeItem, PersonPage, TimelineData, TimelineEvent } from "@/lib/content/types";
import { formatDate, formatEventYears, formatRange, formatYear, lifeYears } from "@/lib/format/years";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { CommonsFigure } from "@/components/story/CommonsFigure";
import { FocusTimeline } from "@/components/timeline/FocusTimeline";
import { WikipediaCredit } from "@/components/ui/WikipediaCredit";

const H2 = "m-0 mt-2 font-display text-2xl font-medium";
const LIFE_IMPORTANCE: Record<LifeItem["kind"], 1 | 2 | 3> = {
  birth: 1,
  death: 1,
  position: 1,
  conflict: 1,
  event: 2,
  team: 2,
  award: 3,
};

/** Life items that are not events on the site get a slug with a colon, which FocusTimeline never opens. */
const LIFE_SLUG_PREFIX = "life:";

/** Life items as timeline pins: offices and teams become ranges, wars link to their event page. */
function lifePins(life: LifeItem[], locale: Locale): TimelineEvent[] {
  return life.map((l, i) => ({
    slug: l.eventSlug ?? `${LIFE_SLUG_PREFIX}${i}`,
    title: l.label,
    place: "",
    startYear: l.startYear,
    endYear: l.endYear,
    isApproximate: l.isApproximate,
    importance: LIFE_IMPORTANCE[l.kind],
    hasFullStory: false,
    textLocale: l.labelLocale ?? locale,
    keywords: [],
  }));
}

function when(l: LifeItem, locale: Locale): string {
  if ((l.kind === "birth" || l.kind === "death") && l.startDate) return formatDate(l.startDate, locale);
  return formatEventYears(l, locale);
}

export function PersonView({ locale, page, data }: { locale: Locale; page: PersonPage; data: TimelineData }) {
  const t = getMessages(locale);
  const { person } = page;
  const lang = person.textLocale;
  const end = person.deathYear ?? data.currentYear;
  const age =
    person.deathYear != null
      ? person.deathYear - person.birthYear - (person.birthYear < 0 && person.deathYear > 0 ? 1 : 0)
      : null;
  const own = new Set(page.life.map((l) => l.eventSlug));
  const context = data.events.filter(
    (e) => e.importance === 1 && e.startYear >= person.birthYear && e.startYear <= end && !own.has(e.slug),
  );

  return (
    <article
      className="gutter mx-auto grid max-w-[760px] grid-cols-[minmax(0,1fr)] gap-[22px] pt-6 pb-[60px]"
      aria-labelledby="person-name"
    >
      <header className="grid gap-4 sm:grid-cols-[200px_1fr] sm:items-start">
        {person.image ? (
          <div className="max-w-[240px]">
            <CommonsFigure
              locale={locale}
              kind="photo"
              caption={person.name}
              captionLocale={lang}
              image={person.image}
              priority
              sizes="240px"
            />
          </div>
        ) : null}
        <div className={person.image ? "" : "sm:col-span-2"}>
          <div className="text-xs font-semibold tracking-[.08em] text-accent uppercase">{t.person.kicker}</div>
          <h1
            id="person-name"
            lang={lang}
            dir="auto"
            className="m-0 mt-1.5 mb-2 font-display text-[clamp(34px,8vw,52px)] leading-[1.04] font-bold text-balance"
          >
            {person.name}
          </h1>
          <p className="m-0 font-mono text-sm text-muted">
            {lifeYears(person, locale)}
            {age != null && age > 0 ? ` · ${t.person.age(age)}` : ""}
          </p>
          {person.description && (
            <p className="m-0 mt-2 text-lg text-muted" lang={lang} dir="auto">
              {person.description}
            </p>
          )}
          <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">{t.person.born}</dt>
            <dd className="m-0" dir="auto">
              {person.birthDate ? formatDate(person.birthDate, locale) : formatYear(person.birthYear, locale)}
              {person.birthPlace ? (
                ` · ${person.birthPlace}`
              ) : (
                <span className="text-muted"> · {t.person.placeNotRecorded}</span>
              )}
            </dd>
            {person.deathYear == null && person.notes.includes("death-not-recorded") && (
              <>
                <dt className="text-muted">{t.person.died}</dt>
                <dd className="m-0 text-muted">{t.person.notRecorded}</dd>
              </>
            )}
            {person.deathYear != null && (
              <>
                <dt className="text-muted">{t.person.died}</dt>
                <dd className="m-0" dir="auto">
                  {person.deathDate ? formatDate(person.deathDate, locale) : formatYear(person.deathYear, locale)}
                  {person.deathPlace ? ` · ${person.deathPlace}` : ""}
                </dd>
              </>
            )}
          </dl>
          {page.topics.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">{t.person.topics}</span>
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
          )}
        </div>
      </header>

      <section aria-labelledby="life-heading" className="grid gap-2.5">
        <h2 id="life-heading" className={H2}>
          {t.person.life}
        </h2>
        <p className="m-0 text-sm text-muted">{t.person.lifeHint}</p>
        <FocusTimeline
          locale={locale}
          eras={data.eras}
          currentYear={data.currentYear}
          startYear={person.birthYear}
          endYear={person.deathYear}
          events={lifePins(page.life, locale)}
          context={context}
        />
        <ol className="m-0 grid list-none gap-1.5 p-0" data-testid="life-list">
          {page.life.map((l, i) => (
            <li
              key={i}
              className="grid grid-cols-[minmax(84px,auto)_1fr] items-baseline gap-3 rounded-lg border border-line bg-surface px-3 py-2"
            >
              <span className="font-mono text-xs text-muted tabular-nums">{when(l, locale)}</span>
              <span className="min-w-0">
                <span className="me-2 text-[10px] font-semibold tracking-[.07em] text-accent-strong uppercase">
                  {t.person.kinds[l.kind]}
                </span>
                {l.eventSlug ? (
                  <Link
                    href={`/${locale}/events/${l.eventSlug}`}
                    className="font-semibold text-ink"
                    lang={l.labelLocale}
                    dir="auto"
                  >
                    {l.label}
                  </Link>
                ) : (
                  <span className="font-semibold" lang={l.labelLocale} dir="auto">
                    {l.label}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {page.world.length > 0 && (
        <section aria-labelledby="world-heading" className="grid gap-2" data-testid="world-list">
          <h2 id="world-heading" className={H2}>
            {t.person.worldHeading}
          </h2>
          <p className="m-0 text-sm text-muted">
            {t.person.worldHint(formatRange({ startYear: person.birthYear, endYear: person.deathYear }, locale))}
          </p>
          <ol className="m-0 grid list-none gap-0.5 p-0">
            {page.world.map((w) => (
              <li key={w.slug} className="grid grid-cols-[minmax(84px,auto)_1fr] items-baseline gap-3 px-3 py-1">
                <span className="font-mono text-xs text-muted tabular-nums">{formatEventYears(w, locale)}</span>
                <Link href={`/${locale}/events/${w.slug}`} className="text-ink" lang={w.textLocale} dir="auto">
                  {w.title}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {person.addedFromSearch && (
        <p role="note" className="note m-0 max-w-[65ch]" data-testid="auto-added">
          {t.person.autoAdded}
        </p>
      )}

      {person.biography && (
        <section aria-labelledby="bio-heading" className="grid gap-3">
          <h2 id="bio-heading" className={H2}>
            {t.person.biography}
          </h2>
          <div
            className="grid max-w-[65ch] gap-3 text-[17px] leading-relaxed"
            lang={page.source ? undefined : lang}
            dir="auto"
          >
            {person.biography.split(/\n+/).map((para, i) => (
              <p key={i} className="m-0">
                {para}
              </p>
            ))}
          </div>
          <WikipediaCredit locale={locale} source={page.source} />
        </section>
      )}

      <section aria-labelledby="data-heading" className="grid max-w-[65ch] gap-2 text-sm" data-testid="about-data">
        <h2 id="data-heading" className="m-0 font-display text-lg font-medium">
          {t.person.aboutData}
        </h2>
        {person.notes.length > 0 && (
          <ul className="m-0 grid gap-1 ps-5">
            {person.notes.map((n) => (
              <li key={n}>{t.person.notes[n]}</li>
            ))}
          </ul>
        )}
        {person.wikidataId && (
          <p className="m-0 text-muted">
            {t.person.factsFrom}{" "}
            <a
              href={`https://www.wikidata.org/wiki/${person.wikidataId}`}
              rel="noopener noreferrer"
              className="underline decoration-line underline-offset-2"
            >
              {t.person.wikidataEntry}
            </a>
            .
          </p>
        )}
        <p className="m-0 text-muted">{t.person.neverInvented}</p>
      </section>
    </article>
  );
}
