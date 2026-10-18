"use client";

import { formatYear } from "@/lib/format/years";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { ArticleSections, useWikiProfile } from "./WikiProfile";

const SOURCE_LINK = "underline decoration-line underline-offset-2";

/**
 * A Wikipedia article the site has no page for, read in the visitor's browser
 * and shown with its dates from Wikidata. Nothing is stored or filled in.
 */
export function WikiArticle({ wikidataId, locale }: { wikidataId: string; locale: Locale }) {
  const t = getMessages(locale).wikiArticle;
  const state = useWikiProfile(wikidataId, locale);
  const wikidata = `https://www.wikidata.org/wiki/${wikidataId}`;

  if (state.kind === "loading")
    return (
      <p className="m-0 text-muted" aria-live="polite">
        {t.loading}
      </p>
    );
  if (state.kind === "failed" || !state.profile.article)
    return (
      <p className="m-0 text-muted" role="status">
        {state.kind === "failed" ? t.failed : t.noArticle}{" "}
        <a href={wikidata} rel="noopener noreferrer" className={SOURCE_LINK}>
          Wikidata
        </a>
      </p>
    );

  const { title, description, lead, dates, article } = state.profile;
  return (
    <>
      <header lang={article.lang} dir="auto">
        <div className="text-xs font-semibold tracking-[.08em] text-accent uppercase" lang={locale}>
          {t.kicker}
        </div>
        <h1 className="m-0 mt-1.5 mb-2 font-display text-[clamp(30px,7vw,46px)] leading-[1.08] font-bold text-balance">
          {title}
        </h1>
        {description && <p className="m-0 text-lg text-muted">{description}</p>}
      </header>
      {dates.length > 0 && (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm" data-testid="article-dates">
          {dates.map((d) => (
            <div key={d.key} className="contents">
              <dt className="text-muted">{t.dates[d.key]}</dt>
              <dd className="m-0 font-mono tabular-nums">{formatYear(d.year, locale)}</dd>
            </div>
          ))}
          <dt className="text-muted">{t.source}</dt>
          <dd className="m-0">
            <a href={wikidata} rel="noopener noreferrer" className={SOURCE_LINK}>
              Wikidata
            </a>
          </dd>
        </dl>
      )}
      <p className="note m-0">{t.notOnTimeline}</p>
      {lead && (
        <div className="grid max-w-[65ch] gap-3 text-[17px] leading-relaxed" lang={article.lang} dir="auto">
          {lead.split(/\n+/).map((para, i) => (
            <p key={i} className="m-0">
              {para}
            </p>
          ))}
        </div>
      )}
      <ArticleSections wikidataId={wikidataId} locale={locale} />
      {/* The sections carry the article's credit; a lead-only article needs its own. */}
      {!state.profile.sections.length && (
        <p className="m-0 text-xs text-muted">
          <a href={article.url} rel="noopener noreferrer" className={SOURCE_LINK} dir="auto">
            Wikipedia: {article.title}
          </a>
          {", CC BY-SA 4.0"}
        </p>
      )}
    </>
  );
}
