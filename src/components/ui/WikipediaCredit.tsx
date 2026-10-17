import type { TextSource } from "@/lib/content/types";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

/** The attribution CC BY-SA requires next to text adapted from Wikipedia. */
export function WikipediaCredit({ locale, source }: { locale: Locale; source: TextSource | null }) {
  if (!source) return null;
  const t = getMessages(locale).credit;
  return (
    <p className="note m-0">
      {t.fromWikipedia}{" "}
      <a
        href={source.url}
        rel="noopener noreferrer"
        className="underline decoration-line underline-offset-2"
        dir="auto"
      >
        {source.title}
      </a>
      {", "}
      <a
        href="https://creativecommons.org/licenses/by-sa/4.0/"
        rel="license noopener noreferrer"
        className="underline decoration-line underline-offset-2"
      >
        {source.license ?? t.license}
      </a>
    </p>
  );
}
