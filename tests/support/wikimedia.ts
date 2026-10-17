import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi } from "vitest";
import type { Entity } from "../../scripts/import/wikidata";

export const fixturePeople = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../fixtures/import/people.json"), "utf8"),
) as Record<string, Entity>;

/**
 * Stands in for Wikidata, Wikipedia and Commons: entities come from `entities`,
 * search hits from `hits`, and everything else answers empty. Returns the URLs asked for.
 */
export function fakeWikimedia(
  entities: Record<string, Entity>,
  hits: { id: string; label: string; description?: string }[] = [],
) {
  const calls: string[] = [];
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(input);
      calls.push(url.toString());
      const p = url.searchParams;
      if (url.host === "www.wikidata.org" && p.get("action") === "wbsearchentities") return json({ search: hits });
      if (url.host === "www.wikidata.org" && p.get("action") === "wbgetentities") {
        const ids = (p.get("ids") ?? "").split("|");
        return json({ entities: Object.fromEntries(ids.filter((id) => entities[id]).map((id) => [id, entities[id]])) });
      }
      if (url.host.endsWith(".wikipedia.org")) {
        const titles = (p.get("titles") ?? "").split("|");
        return json({ query: { pages: titles.map((title) => ({ title, extract: `${title} is a test person.` })) } });
      }
      if (url.host === "query.wikidata.org") return json({ results: { bindings: [] } });
      return json({});
    }),
  );
  return calls;
}
