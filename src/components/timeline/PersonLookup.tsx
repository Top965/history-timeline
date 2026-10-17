"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import type { Candidate } from "@/lib/people/types";

type State =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "list"; candidates: Candidate[] }
  | { kind: "adding"; candidates: Candidate[]; id: string }
  | { kind: "error"; message: string; candidates: Candidate[] };

/**
 * "Look up anyone": finds people on Wikipedia who aren't on the site yet and
 * adds one on request, then opens their new page. Remount it per query.
 */
export function PersonLookup({ locale, query }: { locale: Locale; query: string }) {
  const t = getMessages(locale).search.lookup;
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const candidates = state.kind === "idle" || state.kind === "looking" ? [] : state.candidates;

  async function look() {
    setState({ kind: "looking" });
    try {
      const res = await fetch(`/api/people/lookup?locale=${locale}&q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`lookup ${res.status}`);
      const body = (await res.json()) as { candidates: Candidate[] };
      setState({ kind: "list", candidates: body.candidates });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: t.failed, candidates: [] });
    }
  }

  async function add(c: Candidate) {
    setState({ kind: "adding", candidates, id: c.wikidataId });
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wikidataId: c.wikidataId }),
      });
      const body = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
      if (res.ok && body.slug) return router.push(`/${locale}/people/${body.slug}`);
      const message =
        res.status === 429
          ? t.limited
          : body.error === "no-birth-year" || body.error === "unreliable-dates"
            ? t.cannotAdd
            : t.failed;
      setState({ kind: "error", message, candidates });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: t.failed, candidates });
    }
  }

  if (state.kind === "idle") {
    return (
      <button
        type="button"
        className="w-full rounded-lg border-0 bg-transparent px-2.5 py-[9px] text-start text-sm text-accent-strong hover:bg-accent-soft"
        onClick={look}
      >
        {t.prompt(query)}
      </button>
    );
  }

  return (
    <div className="grid gap-0.5" aria-live="polite" data-testid="person-lookup">
      {state.kind === "looking" && <p className="m-0 p-2.5 text-sm text-muted">{t.looking}</p>}
      {state.kind === "list" && !candidates.length && <p className="m-0 p-2.5 text-sm text-muted">{t.none}</p>}
      {candidates.map((c) => {
        const busy = state.kind === "adding" && state.id === c.wikidataId;
        return (
          <div key={c.wikidataId} className="grid grid-cols-[1fr_auto] items-center gap-2.5 px-2.5 py-1.5">
            <span className="min-w-0 font-semibold" dir="auto">
              {c.name}
              {c.description && (
                <small className="block text-[11px] font-normal text-muted" dir="auto">
                  {c.description}
                </small>
              )}
            </span>
            <button
              type="button"
              className="chip"
              disabled={state.kind === "adding"}
              aria-label={`${t.add}: ${c.name}`}
              onClick={() => add(c)}
            >
              {busy ? t.adding : t.add}
            </button>
          </div>
        );
      })}
      {state.kind === "error" && (
        <p role="alert" className="m-0 p-2.5 text-sm text-muted">
          {state.message}
        </p>
      )}
    </div>
  );
}
