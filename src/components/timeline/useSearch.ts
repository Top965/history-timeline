"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { parseYear, type SearchResult } from "@/lib/search/search";
import { MIN_YEAR } from "@/lib/timeline/geometry";

const DEBOUNCE_MS = 120;

export type SearchState = {
  results: SearchResult[];
  status: "idle" | "loading" | "done" | "error";
  /** Resolves with the results for the current query once they arrive. */
  settled: () => Promise<SearchResult[]>;
};

/**
 * Asks /api/search as the visitor types (debounced, cancelling stale requests).
 * A typed year is answered at once, without waiting for the server.
 */
export function useSearch(locale: Locale, query: string, currentYear: number): SearchState {
  const q = query.trim();
  const cache = useRef(new Map<string, SearchResult[]>());
  const pending = useRef<Promise<SearchResult[]> | null>(null);
  const [state, setState] = useState<{ q: string; results: SearchResult[]; status: SearchState["status"] }>({
    q: "",
    results: [],
    status: "idle",
  });

  useEffect(() => {
    if (!q) {
      pending.current = null;
      return;
    }
    const key = `${locale}:${q.toLowerCase()}`;
    const hit = cache.current.get(key);
    if (hit) {
      pending.current = Promise.resolve(hit);
      setState({ q, results: hit, status: "done" });
      return;
    }
    const controller = new AbortController();
    let resolve!: (r: SearchResult[]) => void;
    pending.current = new Promise((r) => (resolve = r));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?locale=${locale}&q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const { results } = (await res.json()) as { results: SearchResult[] };
        cache.current.set(key, results);
        setState({ q, results, status: "done" });
        resolve(results);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setState({ q, results: [], status: "error" });
        resolve([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locale, q]);

  const year = parseYear(q);
  const yearResult: SearchResult[] =
    year != null && year >= MIN_YEAR && year <= currentYear ? [{ type: "year", year, score: 99 }] : [];
  const fresh = state.q === q;
  const results = !q ? [] : fresh ? state.results : yearResult;
  const status: SearchState["status"] = !q ? "idle" : fresh ? state.status : "loading";
  return {
    results,
    status,
    settled: () => (fresh || !pending.current ? Promise.resolve(results) : pending.current),
  };
}
