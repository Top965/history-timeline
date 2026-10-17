/**
 * Wikipedia lead sections (plain text) in English and Arabic.
 * Text is CC BY-SA 4.0: every page that shows it links back to the article.
 */
import { chunk, type Http } from "./http";

export type WikiLang = "en" | "ar";

export type Lead = {
  /** Article title as Wikipedia normalizes it. */
  title: string;
  url: string;
  revisionId: number | null;
  /** Whole lead section, plain text. */
  extract: string;
};

type ExtractsResponse = {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: { title: string; missing?: boolean; extract?: string; revisions?: { revid: number }[] }[];
  };
};

export const articleUrl = (lang: WikiLang, title: string) =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

/**
 * Lead sections for up to `titles.length` articles, 20 per request (the API's
 * limit for plain-text extracts). The result is keyed by the title that was asked for.
 */
export async function getLeads(http: Http, lang: WikiLang, titles: readonly string[]): Promise<Map<string, Lead>> {
  const out = new Map<string, Lead>();
  const batches = chunk([...new Set(titles)].sort(), 20);
  await Promise.all(
    batches.map(async (batch) => {
      const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
      url.search = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "extracts|revisions",
        rvprop: "ids",
        exintro: "1",
        explaintext: "1",
        exlimit: "20",
        redirects: "1",
        titles: batch.join("|"),
      }).toString();
      const res = await http.json<ExtractsResponse>(url.toString(), {
        service: "wikipedia",
        operation: `wikipedia.${lang}.extracts`,
      });
      const q = res.query ?? {};
      const follow = (t: string) => {
        let cur = t;
        for (const step of [...(q.normalized ?? []), ...(q.redirects ?? [])]) if (step.from === cur) cur = step.to;
        return cur;
      };
      const pages = new Map((q.pages ?? []).filter((p) => !p.missing).map((p) => [p.title, p]));
      for (const asked of batch) {
        const page = pages.get(follow(asked));
        const extract = page?.extract ? cleanExtract(page.extract) : "";
        if (!page || !extract) continue;
        out.set(asked, {
          title: page.title,
          url: articleUrl(lang, page.title),
          revisionId: page.revisions?.[0]?.revid ?? null,
          extract,
        });
      }
    }),
  );
  return out;
}

/** Drops pronunciation brackets left empty by plain-text extraction and tidies spacing. */
export function cleanExtract(text: string): string {
  return text
    .replace(/\s*\(\s*[;,]?\s*\)/g, "")
    .replace(/\(\s*[;,]\s*/g, "(")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The first `maxChars` of a lead, cut at a sentence end. Works for English and
 * Arabic punctuation. Used for the short summaries on cards and the timeline.
 */
export function summarize(text: string, maxChars = 420): string {
  const firstPara = text.split(/\n+/)[0].trim();
  if (firstPara.length <= maxChars) return firstPara;
  const cut = firstPara.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("۔ "), cut.lastIndexOf("؟ "), cut.lastIndexOf("! "));
  return end > maxChars * 0.4 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

/** Whole paragraphs of a lead, up to `maxChars`. Used for biographies. */
export function trimLead(text: string, maxChars = 2000): string {
  const paras = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  let out = "";
  for (const p of paras) {
    const next = out ? `${out}\n\n${p}` : p;
    if (next.length > maxChars) break;
    out = next;
  }
  return out || summarize(text, maxChars);
}

type PagePropsResponse = {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: { title: string; missing?: boolean; pageprops?: { wikibase_item?: string } }[];
  };
};

/**
 * Wikidata ids for article titles, following redirects, 50 titles per request.
 * Keyed by the title that was asked for; titles with no article are left out.
 */
export async function resolveTitles(
  http: Http,
  lang: WikiLang,
  titles: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    chunk([...new Set(titles)].sort(), 50).map(async (batch) => {
      const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
      url.search = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "pageprops",
        ppprop: "wikibase_item",
        redirects: "1",
        titles: batch.join("|"),
      }).toString();
      const res = await http.json<PagePropsResponse>(url.toString(), {
        service: "wikipedia",
        operation: `wikipedia.${lang}.pageprops`,
      });
      const q = res.query ?? {};
      const follow = (t: string) => {
        let cur = t;
        for (const step of [...(q.normalized ?? []), ...(q.redirects ?? [])]) if (step.from === cur) cur = step.to;
        return cur;
      };
      const ids = new Map((q.pages ?? []).map((p) => [p.title, p.pageprops?.wikibase_item]));
      for (const asked of batch) {
        const id = ids.get(follow(asked));
        if (id) out.set(asked, id);
      }
    }),
  );
  return out;
}
