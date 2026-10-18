"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { loadWikiProfile, type WikiProfile } from "@/lib/wiki/fetchProfile";
import { SECTION_ATTR } from "@/lib/wiki/jump";

type State = { kind: "loading" } | { kind: "ready"; profile: WikiProfile } | { kind: "failed" };

export function useWikiProfile(wikidataId: string, locale: Locale): State {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    loadWikiProfile(wikidataId, locale).then(
      (profile) => live && setState({ kind: "ready", profile }),
      (err) => {
        console.error("wiki profile failed", wikidataId, err);
        if (live) setState({ kind: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, [wikidataId, locale]);
  return state;
}

const H2 = "m-0 mt-2 font-display text-2xl font-medium";
const SOURCE_LINK = "underline decoration-line underline-offset-2";

/** Extra profile rows (full name, height, positions…) under the birth and death lines. */
export function ProfileFacts({ wikidataId, locale }: { wikidataId: string; locale: Locale }) {
  const t = getMessages(locale).person.profile;
  const state = useWikiProfile(wikidataId, locale);
  if (state.kind !== "ready" || !state.profile.facts.length) return null;
  return (
    <dl className="m-0 mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm" data-testid="profile-facts">
      {state.profile.facts.map((f) => (
        <div key={f.key} className="contents">
          <dt className="text-muted">{t.facts[f.key]}</dt>
          <dd className="m-0" dir="auto">
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Career table and honours, both linked to where they come from. */
export function CareerAndHonours({
  wikidataId,
  locale,
  fallbackUrl,
}: {
  wikidataId: string;
  locale: Locale;
  fallbackUrl: string | null;
}) {
  const t = getMessages(locale).person.profile;
  const state = useWikiProfile(wikidataId, locale);
  if (state.kind === "loading")
    return (
      <p className="m-0 text-sm text-muted" aria-live="polite">
        {t.loading}
      </p>
    );
  if (state.kind === "failed")
    return (
      <p className="m-0 text-sm text-muted" role="status">
        {t.failed}{" "}
        {fallbackUrl && (
          <a href={fallbackUrl} rel="noopener noreferrer" className={SOURCE_LINK}>
            {t.openWikipedia}
          </a>
        )}
      </p>
    );
  const { career, honours, article } = state.profile;
  const stats = career.some((r) => r.apps != null || r.goals != null);
  return (
    <>
      {career.length > 0 && (
        <section aria-labelledby="career-heading" className="grid gap-2" data-testid="career">
          <h2 id="career-heading" className={H2}>
            {t.career}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-start text-xs text-muted">
                  <th className="px-3 py-2 text-start font-medium">{t.years}</th>
                  <th className="px-3 py-2 text-start font-medium">{t.team}</th>
                  {stats && <th className="px-3 py-2 text-end font-medium">{t.apps}</th>}
                  {stats && <th className="px-3 py-2 text-end font-medium">{t.goals}</th>}
                </tr>
              </thead>
              <tbody>
                {career.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap text-muted tabular-nums">
                      {r.startYear}–{r.endYear ?? ""}
                    </td>
                    <td className="px-3 py-1.5" dir="auto">
                      {r.team}
                    </td>
                    {stats && <td className="px-3 py-1.5 text-end tabular-nums">{r.apps ?? "—"}</td>}
                    {stats && <td className="px-3 py-1.5 text-end tabular-nums">{r.goals ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-xs text-muted">
            <a href={`https://www.wikidata.org/wiki/${wikidataId}`} rel="noopener noreferrer" className={SOURCE_LINK}>
              Wikidata
            </a>
          </p>
        </section>
      )}
      {honours.length > 0 && article && (
        <section aria-labelledby="honours-heading" className="grid gap-2" data-testid="honours">
          <h2 id="honours-heading" className={H2}>
            {t.honours}
          </h2>
          <div className="grid gap-3" lang={article.lang} dir="auto">
            {honours.map((g, i) => (
              <div key={i} className="grid gap-1">
                {g.group && <h3 className="m-0 text-sm font-semibold">{g.group}</h3>}
                <ul className="m-0 grid list-none gap-1 p-0">
                  {g.items.map((h, j) => (
                    <li
                      key={j}
                      className="grid grid-cols-[1fr_auto] items-baseline gap-3 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
                    >
                      <span>{h.title}</span>
                      <span className="font-mono text-xs text-muted tabular-nums">{h.years}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="m-0 text-xs text-muted">
            <a href={article.url} rel="noopener noreferrer" className={SOURCE_LINK} dir="auto">
              Wikipedia: {article.title}
            </a>
            {", CC BY-SA 4.0"}
          </p>
        </section>
      )}
    </>
  );
}

/** The rest of the Wikipedia article as sections the reader opens one at a time. */
export function ArticleSections({ wikidataId, locale }: { wikidataId: string; locale: Locale }) {
  const t = getMessages(locale).person.profile;
  const state = useWikiProfile(wikidataId, locale);
  if (state.kind !== "ready" || !state.profile.article || !state.profile.sections.length) return null;
  const { sections, article } = state.profile;
  return (
    <section aria-labelledby="article-heading" className="grid gap-2" data-testid="article-sections">
      <h2 id="article-heading" className={H2}>
        {t.article}
      </h2>
      <p className="m-0 text-sm text-muted">{t.articleHint}</p>
      <div className="grid" lang={article.lang} dir="auto">
        {sections.map((s, i) => (
          <details
            key={i}
            {...{ [SECTION_ATTR]: "" }}
            className="scroll-mt-20 rounded-md border-b border-line py-2 transition-colors duration-700 [&.jumped]:bg-accent-soft"
          >
            <summary className="cursor-pointer font-display text-xl font-medium">{s.title}</summary>
            <div className="grid max-w-[65ch] gap-3 pt-2 text-[17px] leading-relaxed">
              {s.body.split(/\n{2,}/).map((para, j) =>
                para.startsWith("## ") ? (
                  <h3 key={j} className="m-0 mt-2 text-base font-semibold">
                    {para.slice(3)}
                  </h3>
                ) : (
                  <p key={j} className="m-0 whitespace-pre-line">
                    {para}
                  </p>
                ),
              )}
            </div>
          </details>
        ))}
      </div>
      <p className="note m-0">
        <a href={article.url} rel="noopener noreferrer" className={SOURCE_LINK} dir="auto">
          Wikipedia: {article.title}
        </a>
        {", "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          rel="license noopener noreferrer"
          className={SOURCE_LINK}
        >
          CC BY-SA 4.0
        </a>
      </p>
    </section>
  );
}
