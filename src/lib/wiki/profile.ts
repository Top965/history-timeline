/**
 * Turns a person's Wikidata entry and Wikipedia article into the profile box,
 * career table, honours and article sections of their page. Pure functions:
 * fetching lives in ./fetchProfile. Nothing is filled in that the source does
 * not say; a fact without a value is simply left out.
 */

type Snak = { snaktype?: string; datavalue?: { value: unknown } };
export type Claim = { mainsnak: Snak; rank?: string; qualifiers?: Record<string, Snak[]> };
export type WikidataEntity = {
  id: string;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, { title: string }>;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
};
export type Labels = Map<string, { en?: string; ar?: string }>;
export type WikiLang = "en" | "ar";

export type FactKey =
  | "fullName"
  | "height"
  | "positions"
  | "occupation"
  | "citizenship"
  | "currentTeam"
  | "number"
  | "notableWorks"
  | "education";
export type Fact = { key: FactKey; value: string };

export type CareerRow = {
  team: string;
  startYear: number;
  endYear: number | null;
  apps: number | null;
  goals: number | null;
};

export type DateKey = "published" | "inception" | "pointInTime" | "start" | "end";
export type KeyDate = { key: DateKey; year: number };

export type HonourGroup = { group: string | null; items: { title: string; years: string }[] };
export type ArticleSection = { title: string; level: number; body: string };

const claims = (e: WikidataEntity, prop: string) =>
  (e.claims?.[prop] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak.snaktype !== "novalue");

const itemId = (s: Snak | undefined): string | null => {
  const v = s?.datavalue?.value as { id?: string } | undefined;
  return v?.id && /^Q\d+$/.test(v.id) ? v.id : null;
};

/** Year of a Wikidata time value ("+2013-07-01T00:00:00Z"). */
export function timeYear(s: Snak | undefined): number | null {
  const v = s?.datavalue?.value as { time?: string } | undefined;
  const m = v?.time?.match(/^([+-]\d+)-/);
  return m ? Number(m[1]) : null;
}

const quantity = (s: Snak | undefined): { amount: number; unit: string } | null => {
  const v = s?.datavalue?.value as { amount?: string; unit?: string } | undefined;
  if (!v?.amount) return null;
  const amount = Number(v.amount);
  return Number.isFinite(amount) ? { amount, unit: v.unit ?? "" } : null;
};

const count = (s: Snak | undefined): number | null => {
  const q = quantity(s);
  return q && Number.isInteger(q.amount) && q.amount >= 0 ? q.amount : null;
};

/** Every item an entry points to that the profile may show, for one label request. */
export function referencedItems(e: WikidataEntity): string[] {
  const ids = new Set<string>();
  for (const prop of ["P413", "P106", "P27", "P54", "P800", "P69"])
    for (const c of claims(e, prop)) {
      const id = itemId(c.mainsnak);
      if (id) ids.add(id);
    }
  return [...ids];
}

export const labelIn = (labels: Labels, id: string, lang: WikiLang): string | null => {
  const l = labels.get(id);
  return l?.[lang] ?? l?.en ?? null;
};

const LIMITS: Partial<Record<FactKey, number>> = { occupation: 4, notableWorks: 5, education: 3, positions: 3 };

/** Height in metres from a P2048 value in metres or centimetres. */
function height(e: WikidataEntity): string | null {
  const q = quantity(claims(e, "P2048")[0]?.mainsnak);
  if (!q) return null;
  const metres = q.unit.endsWith("/Q174728") ? q.amount / 100 : q.unit.endsWith("/Q11573") ? q.amount : null;
  return metres && metres > 0.5 && metres < 2.8 ? `${metres.toFixed(2)} m` : null;
}

function career(e: WikidataEntity): Claim[] {
  return claims(e, "P54").filter((c) => itemId(c.mainsnak) && timeYear(c.qualifiers?.P580?.[0]) != null);
}

export function profileFacts(e: WikidataEntity, labels: Labels, lang: WikiLang): Fact[] {
  const facts: Fact[] = [];
  const add = (key: FactKey, value: string | null) => {
    if (value) facts.push({ key, value });
  };
  const items = (prop: string, key: FactKey) => {
    const names = [
      ...new Set(
        claims(e, prop)
          .map((c) => itemId(c.mainsnak))
          .map((id) => (id ? labelIn(labels, id, lang) : null))
          .filter((x): x is string => !!x),
      ),
    ];
    add(key, names.slice(0, LIMITS[key] ?? 3).join(" · ") || null);
  };

  const birthName = claims(e, "P1477")
    .map((c) => c.mainsnak.datavalue?.value as { text?: string } | undefined)
    .find((v) => v?.text)?.text;
  add("fullName", birthName ?? null);
  add("height", height(e));
  items("P413", "positions");
  items("P106", "occupation");
  items("P27", "citizenship");

  // The current team is a membership with a start and no end; the latest one wins.
  const current = career(e)
    .filter((c) => !c.qualifiers?.P582?.length)
    .sort((a, b) => timeYear(b.qualifiers?.P580?.[0])! - timeYear(a.qualifiers?.P580?.[0])!)[0];
  if (current) {
    add("currentTeam", labelIn(labels, itemId(current.mainsnak)!, lang));
    const n = current.qualifiers?.P1618?.[0]?.datavalue?.value;
    add("number", typeof n === "string" && /^\d{1,3}$/.test(n) ? n : null);
  }
  items("P800", "notableWorks");
  items("P69", "education");
  return facts;
}

export function careerRows(e: WikidataEntity, labels: Labels, lang: WikiLang): CareerRow[] {
  return career(e)
    .map((c) => ({
      team: labelIn(labels, itemId(c.mainsnak)!, lang) ?? "",
      startYear: timeYear(c.qualifiers?.P580?.[0])!,
      endYear: timeYear(c.qualifiers?.P582?.[0]),
      apps: count(c.qualifiers?.P1350?.[0]),
      goals: count(c.qualifiers?.P1351?.[0]),
    }))
    .filter((r) => r.team)
    .sort((a, b) => a.startYear - b.startYear || (a.endYear ?? 1e9) - (b.endYear ?? 1e9));
}

const DATE_PROPS: [DateKey, string[]][] = [
  ["pointInTime", ["P585"]],
  ["start", ["P580"]],
  ["end", ["P582", "P576"]],
  ["inception", ["P571"]],
  ["published", ["P577"]],
];

/** The years an entry gives for when something happened, was made or was published; nothing is guessed. */
export function keyDates(e: WikidataEntity): KeyDate[] {
  const out: KeyDate[] = [];
  for (const [key, props] of DATE_PROPS) {
    const years = props.flatMap((p) => claims(e, p).map((c) => timeYear(c.mainsnak)));
    const year = years.find((y): y is number => y != null);
    if (year != null) out.push({ key, year });
  }
  return out;
}

/** The text before the first heading of a plain-text extract: the article's lead. */
export const articleLead = (text: string) => text.split(/\n={2,6}[^\n]*={2,6}\s*\n/)[0].trim();

/**
 * Splits a plain-text extract (exsectionformat=wiki) into sections. The lead,
 * shown elsewhere as the biography, is dropped.
 */
export function parseArticle(text: string): ArticleSection[] {
  const out: ArticleSection[] = [];
  let current: ArticleSection | null = null;
  for (const line of text.split("\n")) {
    const h = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (h) {
      current = { title: h[2], level: h[1].length, body: "" };
      out.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  return out.map((s) => ({ ...s, body: s.body.replace(/\n{3,}/g, "\n\n").trim() }));
}

const HONOURS =
  /^(honou?rs|titles and honou?rs|achievements|awards and honou?rs|الإنجازات|الألقاب|البطولات|الجوائز والإنجازات|الإنجازات والجوائز)$/i;
const SKIP =
  /^(see also|notes|references|external links|further reading|bibliography|sources|citations|footnotes|career statistics|statistics|filmography|discography|works cited|انظر أيضا|انظر أيضًا|مراجع|المراجع|المصادر|مصادر|وصلات خارجية|روابط خارجية|ملاحظات|هوامش|إحصائيات|الإحصائيات|قراءات إضافية)$/i;

/** Level-2 sections worth reading on the page, each with its subsections folded into its body. */
export function readableSections(sections: ArticleSection[]): ArticleSection[] {
  const out: ArticleSection[] = [];
  let skipping = false;
  for (const s of sections) {
    if (s.level === 2) {
      skipping = HONOURS.test(s.title) || SKIP.test(s.title);
      if (!skipping) out.push({ ...s });
    } else if (!skipping && out.length) {
      const last = out[out.length - 1];
      last.body = `${last.body}\n\n## ${s.title}\n\n${s.body}`.trim();
    }
  }
  return out.filter((s) => s.body.length > 0);
}

const YEAR = /\b(1[5-9]\d\d|20\d\d)\b/;

/**
 * Honours listed as "Title: 2010, 2011" lines under an Honours section, grouped
 * by the subheading (or plain line) above them. Lines without a year are left
 * out rather than guessed.
 */
export function parseHonours(sections: ArticleSection[]): HonourGroup[] {
  const start = sections.findIndex((s) => s.level === 2 && HONOURS.test(s.title));
  if (start < 0) return [];
  const groups: HonourGroup[] = [];
  let group: HonourGroup | null = null;
  const open = (name: string | null) => {
    group = { group: name, items: [] };
    groups.push(group);
  };
  for (let i = start; i < sections.length; i++) {
    const s = sections[i];
    if (i > start && s.level <= 2) break;
    if (i > start) open(s.title);
    for (const raw of s.body.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(.{2,120}?):\s*(.+)$/);
      if (m && YEAR.test(m[2])) {
        if (!group) open(null);
        group!.items.push({ title: m[1].trim(), years: m[2].trim().slice(0, 200) });
      } else if (!m && line.length <= 60 && !YEAR.test(line)) {
        open(line);
      }
    }
  }
  return groups.filter((g) => g.items.length > 0);
}
