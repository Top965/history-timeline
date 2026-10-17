import type { Locale } from "@/lib/i18n/config";

/**
 * Historical years: negative = BCE, positive = CE, no year 0.
 * A continuous timeline position can round to 0; that is shown as 1 CE, as in the prototype.
 */
export function formatYear(year: number, locale: Locale): string {
  const y = Math.round(year);
  if (locale === "ar") {
    if (y < 0) return `${Math.abs(y)} ق.م`;
    if (y === 0) return "1 م";
    return y < 1000 ? `${y} م` : String(y);
  }
  if (y < 0) return `${Math.abs(y).toLocaleString("en-US")} BCE`;
  if (y === 0) return "1 CE";
  return y < 1000 ? `${y} CE` : String(y);
}

/** Short label for chips and axis-like places: drops the CE suffix. */
export function formatYearShort(year: number, locale: Locale): string {
  return formatYear(year, locale).replace(/ (CE|م)$/, "");
}

const APPROX: Record<Locale, string> = { en: "c. ", ar: "نحو " };
const TODAY: Record<Locale, string> = { en: "today", ar: "اليوم" };

export type YearSpan = { startYear: number; endYear: number | null; isApproximate?: boolean };

/** "c. 2,560 BCE", "1914 – 1918" */
export function formatEventYears(e: YearSpan, locale: Locale): string {
  const start = (e.isApproximate ? APPROX[locale] : "") + formatYear(e.startYear, locale);
  return e.endYear != null && e.endYear !== e.startYear ? `${start} – ${formatYear(e.endYear, locale)}` : start;
}

/** Ranges whose end is null are ongoing: "1930 – today". */
export function formatRange(r: YearSpan, locale: Locale): string {
  const start = (r.isApproximate ? APPROX[locale] : "") + formatYear(r.startYear, locale);
  return `${start} – ${r.endYear == null ? TODAY[locale] : formatYear(r.endYear, locale)}`;
}

const DATE_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  ar: new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};

/** "28 Jun 1914" / "28 يونيو 1914". Input is an ISO date (YYYY-MM-DD). */
export function formatDate(isoDate: string, locale: Locale): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid ISO date: ${isoDate}`);
  return DATE_FORMATS[locale].format(d);
}

export function formatDateRange(start: string, end: string | null, locale: Locale): string {
  return end ? `${formatDate(start, locale)} – ${formatDate(end, locale)}` : formatDate(start, locale);
}
