/**
 * Links a moment on a person's timeline (a war, an office, a team) to the
 * part of their Wikipedia article that tells it. A section is only chosen when
 * it names the moment outright; otherwise nothing is guessed.
 */

export const normalize = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/**
 * The label as written, then without club affixes like "FC" and a leading
 * "the", then without its first word ("Iraqi invasion of Kuwait" is also
 * "invasion of Kuwait").
 */
function variants(label: string): string[] {
  const full = normalize(label);
  const bare = full.replace(/ (fc|f c|cf|sc|ac|afc|the) /g, " ").replace(/\s+/g, " ");
  const words = bare.trim().split(" ");
  const tail = words.length >= 3 ? ` ${words.slice(1).join(" ")} ` : bare;
  return [...new Set([full, bare, tail])].filter((v) => v.trim().length >= 4);
}

const occurrences = (text: string, key: string) => text.split(key).length - 1;

const STOP = new Set([
  "and",
  "the",
  "of",
  "in",
  "on",
  "for",
  "with",
  "from",
  "to",
  "at",
  "by",
  "في",
  "من",
  "على",
  "إلى",
  "عن",
  "مع",
]);

/**
 * The words that carry the label's meaning. Latin words match at the start of
 * a word; Arabic ones anywhere, since Arabic joins "and" and "the" to a word.
 */
function keyWords(label: string): string[] {
  const words = normalize(label)
    .trim()
    .split(" ")
    .map((w) => (/^و\p{Script=Arabic}{3,}$/u.test(w) ? w.slice(1) : w))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].map((w) => (/\p{Script=Arabic}/u.test(w) ? w : ` ${w}`));
}

/**
 * When no section names the label outright: the section holding most of its
 * words (at least two, and two thirds of them), the title counting double.
 */
function byWords(label: string, titles: string[], texts: string[]): number {
  const words = keyWords(label);
  const need = Math.max(2, Math.ceil((words.length * 2) / 3));
  if (words.length < 2) return -1;
  let best = -1;
  let bestScore = 0;
  titles.forEach((title, i) => {
    const found = words.filter((w) => title.includes(w) || texts[i].includes(w));
    if (found.length < need) return;
    const score =
      found.length * 1000 +
      words.filter((w) => title.includes(w)).length * 100 +
      found.reduce((n, w) => n + occurrences(texts[i], w), 0);
    if (score > bestScore) [best, bestScore] = [i, score];
  });
  return best;
}

/**
 * Index of the section whose title names the label, or failing that the one
 * whose text names it most often, or failing that the one holding most of its
 * words; -1 when none does. `others` are the other moments on the same
 * timeline: where one of them contains the label ("Iran–Iraq War" contains
 * "Iraq War"), its mentions are not counted as the label's.
 */
export function matchSection(
  label: string,
  sections: { title: string; text: string }[],
  others: string[] = [],
): number {
  const keys = variants(label);
  if (!keys.length) return -1;
  const self = normalize(label);
  const longer = others.map(normalize).filter((o) => o !== self && o.includes(self));
  const strip = (s: string) => longer.reduce((t, o) => t.split(o).join("  "), normalize(s));
  const titles = sections.map((s) => strip(s.title));
  const texts = sections.map((s) => strip(s.text));
  for (const k of keys) {
    const i = titles.findIndex((t) => t.includes(k));
    if (i >= 0) return i;
  }
  for (const k of keys) {
    let best = -1;
    let most = 0;
    texts.forEach((t, i) => {
      const n = occurrences(t, k);
      if (n > most) [best, most] = [i, n];
    });
    if (best >= 0) return best;
  }
  return byWords(label, titles, texts);
}

export const SECTION_ATTR = "data-article-section";

/** Opens and scrolls to the article section about `label`. Returns false when no section names it. */
export function jumpToSection(label: string, others: string[] = []): boolean {
  const els = [...document.querySelectorAll<HTMLDetailsElement>(`details[${SECTION_ATTR}]`)];
  const i = matchSection(
    label,
    els.map((el) => ({ title: el.querySelector("summary")?.textContent ?? "", text: el.textContent ?? "" })),
    others,
  );
  if (i < 0) return false;
  const el = els[i];
  el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("jumped");
  window.setTimeout(() => el.classList.remove("jumped"), 2000);
  return true;
}
