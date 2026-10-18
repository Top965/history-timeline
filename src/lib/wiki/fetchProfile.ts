/**
 * Loads a person's profile straight from Wikidata and Wikipedia in the
 * reader's browser (both APIs allow it with origin=*), so the site stores and
 * rebuilds nothing for it. One load per person is shared by every part of the
 * page that shows it.
 */
import {
  careerRows,
  parseArticle,
  parseHonours,
  profileFacts,
  readableSections,
  referencedItems,
  type ArticleSection,
  type CareerRow,
  type Fact,
  type HonourGroup,
  type Labels,
  type WikiLang,
  type WikidataEntity,
} from "./profile";

export type WikiProfile = {
  facts: Fact[];
  career: CareerRow[];
  honours: HonourGroup[];
  sections: ArticleSection[];
  /** The article everything below the profile box comes from. */
  article: { lang: WikiLang; title: string; url: string } | null;
};

const WIKIDATA = "https://www.wikidata.org/w/api.php";

async function getJson<T>(url: string, params: Record<string, string>): Promise<T> {
  const u = new URL(url);
  u.search = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params }).toString();
  const res = await fetch(u);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${u.host}`);
  return (await res.json()) as T;
}

async function labelsFor(ids: string[]): Promise<Labels> {
  const out: Labels = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const res = await getJson<{ entities?: Record<string, { labels?: Record<string, { value: string }> }> }>(WIKIDATA, {
      action: "wbgetentities",
      props: "labels",
      languages: "en|ar",
      ids: ids.slice(i, i + 50).join("|"),
    });
    for (const [id, e] of Object.entries(res.entities ?? {}))
      out.set(id, { en: e.labels?.en?.value, ar: e.labels?.ar?.value });
  }
  return out;
}

async function articleText(lang: WikiLang, title: string): Promise<string> {
  const res = await getJson<{ query?: { pages?: { extract?: string; missing?: boolean }[] } }>(
    `https://${lang}.wikipedia.org/w/api.php`,
    { action: "query", prop: "extracts", explaintext: "1", exsectionformat: "wiki", redirects: "1", titles: title },
  );
  return res.query?.pages?.[0]?.extract ?? "";
}

async function load(wikidataId: string, lang: WikiLang): Promise<WikiProfile> {
  const res = await getJson<{ entities?: Record<string, WikidataEntity> }>(WIKIDATA, {
    action: "wbgetentities",
    props: "claims|sitelinks",
    sitefilter: "enwiki|arwiki",
    ids: wikidataId,
  });
  const entity = res.entities?.[wikidataId];
  if (!entity?.claims) throw new Error(`No Wikidata entry for ${wikidataId}`);

  // The article in the reader's language when there is one, otherwise English.
  const site = entity.sitelinks?.[`${lang}wiki`] ? lang : entity.sitelinks?.enwiki ? "en" : null;
  const title = site ? entity.sitelinks![`${site}wiki`].title : null;
  const [labels, text] = await Promise.all([
    labelsFor(referencedItems(entity)),
    site && title ? articleText(site, title).catch(() => "") : Promise.resolve(""),
  ]);
  const sections = parseArticle(text);
  return {
    facts: profileFacts(entity, labels, lang),
    career: careerRows(entity, labels, lang),
    honours: parseHonours(sections),
    sections: readableSections(sections),
    article:
      site && title
        ? {
            lang: site,
            title,
            url: `https://${site}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
          }
        : null,
  };
}

const cache = new Map<string, Promise<WikiProfile>>();

export function loadWikiProfile(wikidataId: string, lang: WikiLang): Promise<WikiProfile> {
  const key = `${wikidataId}:${lang}`;
  let p = cache.get(key);
  if (!p) {
    p = load(wikidataId, lang);
    // A failed load can be tried again on the next visit.
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
