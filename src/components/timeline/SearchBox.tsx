"use client";

import { useId, useLayoutEffect, useMemo, useState } from "react";
import type { TimelineData } from "@/lib/content/types";
import { formatEventYears, formatRange, formatYear } from "@/lib/format/years";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { buildSearchIndex, search, type SearchResult } from "@/lib/search/search";
import { eraAt } from "@/lib/timeline/geometry";

type Props = {
  locale: Locale;
  data: TimelineData;
  onChoose: (result: SearchResult) => void;
};

export function resultName(r: SearchResult, locale: Locale): string {
  switch (r.type) {
    case "year":
      return formatYear(r.year, locale);
    case "era":
      return getMessages(locale).readout.era(r.era.name);
    case "topic":
      return r.topic.name;
    case "event":
      return r.event.title;
  }
}

function resultDetail(r: SearchResult, data: TimelineData, locale: Locale): string {
  const t = getMessages(locale);
  switch (r.type) {
    case "year": {
      const era = eraAt(data.eras, r.year);
      return era ? t.readout.era(era.name) : "";
    }
    case "era":
      return formatRange({ startYear: r.era.startYear, endYear: r.era.endYear }, locale);
    case "topic":
      return formatRange(r.topic, locale);
    case "event":
      return formatEventYears(r.event, locale);
  }
}

/** Search combobox (ARIA 1.2 pattern): type, arrow through results, Enter to go. */
export function SearchBox({ locale, data, onChoose }: Props) {
  const t = getMessages(locale).search;
  const id = useId();
  const index = useMemo(() => buildSearchIndex(data), [data]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => search(index, query), [index, query]);
  const listId = `${id}-results`;
  const showList = open && query.trim().length > 0;

  // Close when the page is hidden by navigation (the page itself stays mounted).
  useLayoutEffect(() => () => setOpen(false), []);

  function choose(r: SearchResult) {
    setQuery(resultName(r, locale));
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
    onChoose(r);
  }

  return (
    <form
      role="search"
      className="relative flex max-w-[460px] min-w-0 flex-[1_1_320px] gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (results.length) choose(results[Math.min(active, results.length - 1)]);
        else setOpen(true);
      }}
    >
      <label htmlFor={`${id}-input`} className="sr-only">
        {t.label}
      </label>
      <input
        id={`${id}-input`}
        type="search"
        value={query}
        placeholder={t.placeholder}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length ? `${id}-r${active}` : undefined}
        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-sm text-ink"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <button className="btn-primary" type="submit">
        {t.go}
      </button>
      <div
        id={listId}
        role="listbox"
        aria-label={t.label}
        hidden={!showList}
        className="absolute inset-x-0 top-[calc(100%+6px)] z-[15] grid max-h-[360px] gap-0.5 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.18)]"
        onMouseDown={(e) => e.preventDefault()}
      >
        {results.length ? (
          results.map((r, i) => (
            <button
              key={`${r.type}:${r.type === "year" ? r.year : r.type === "era" ? r.era.slug : r.type === "topic" ? r.topic.slug : r.event.slug}`}
              id={`${id}-r${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className="grid min-w-0 grid-cols-[62px_1fr] items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-[9px] text-start hover:bg-accent-soft aria-selected:bg-accent-soft"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r)}
            >
              <span className="text-[10px] font-semibold tracking-[.07em] text-accent-strong uppercase">
                {t.types[r.type]}
              </span>
              <span className="min-w-0 font-semibold" dir="auto">
                {resultName(r, locale)}
                <small className="block font-mono text-[11px] font-normal text-muted">
                  {resultDetail(r, data, locale)}
                </small>
              </span>
            </button>
          ))
        ) : (
          <div className="p-2.5 text-sm text-muted">{t.noMatch}</div>
        )}
      </div>
    </form>
  );
}
