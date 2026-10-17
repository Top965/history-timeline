export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

/** Locale that every piece of content exists in; others fall back to it. */
export const CONTENT_SOURCE_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", ar: "العربية" };

/**
 * Picks the best supported locale from an Accept-Language header.
 * "ar-KW,ar;q=0.9,en;q=0.8" -> "ar"
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((r) => r.base && r.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return (ranked.find((r) => isLocale(r.base))?.base as Locale | undefined) ?? DEFAULT_LOCALE;
}
