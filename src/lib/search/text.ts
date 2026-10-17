/**
 * Text normalization for keyword search in English and Arabic.
 * - lowercases, strips Latin accents and Arabic diacritics/tatweel
 * - unifies Arabic letter variants (أ إ آ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي)
 * - converts Arabic-Indic and Persian digits to 0-9
 * - drops the Arabic definite article (ال / وال / بال …) from longer words
 */

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const LATIN_DIACRITICS = /[̀-ͯ]/g;

export function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function normalizeArabicLetters(s: string): string {
  return s
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

const ARTICLE = /^(?:و|ب|ف|ك|ل)?ال(?=.{3,})/;

function stripArabicArticle(word: string): string {
  return /^[؀-ۿ]/.test(word) ? word.replace(ARTICLE, "") : word;
}

export function normalize(s: string): string {
  return normalizeArabicLetters(toAsciiDigits(s.toLowerCase().normalize("NFD").replace(LATIN_DIACRITICS, "")))
    .replace(/[’'`ʼ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function words(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean).map(stripArabicArticle);
}

/** Levenshtein distance, giving up early (returns a large number) when lengths differ by more than 2. */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 3 exact, 2 prefix, 1.5 close typo, 0 no match. */
export function wordScore(query: string, word: string): number {
  if (query === word) return 3;
  if ((query.length >= 3 && word.startsWith(query)) || (word.length >= 4 && query.startsWith(word))) return 2;
  if (query.length >= 5 && editDistance(query, word) <= (query.length >= 8 ? 2 : 1)) return 1.5;
  return 0;
}

export const STOP_WORDS = new Set([
  // English
  "the",
  "of",
  "and",
  "in",
  "a",
  "an",
  "to",
  "on",
  "at",
  "for",
  "era",
  "age",
  "period",
  "history",
  "timeline",
  "time",
  "line",
  // Arabic (normalized forms)
  "في",
  "من",
  "علي",
  "عن",
  "الي",
  "و",
  "تاريخ",
  "عصر",
  "حقبه",
  "فتره",
  "خط",
  "زمن",
]);
