import Link from "next/link";
import type { PersonCard } from "@/lib/content/types";
import { commonsThumbUrl } from "@/lib/commons/thumbnails";
import { lifeYears } from "@/lib/format/years";
import type { Locale } from "@/lib/i18n/config";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** A person with a small round photo, linking to their page. */
export function PersonChip({ locale, person }: { locale: Locale; person: PersonCard }) {
  return (
    <Link
      href={`/${locale}/people/${person.slug}`}
      className="grid min-w-0 grid-cols-[48px_1fr] items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-ink no-underline hover:border-accent"
    >
      {person.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={commonsThumbUrl(person.image, 330)}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-12 rounded-full border border-line bg-track object-cover object-top"
        />
      ) : (
        <span
          className="grid size-12 place-items-center rounded-full border border-line bg-accent-soft font-semibold text-accent-strong"
          aria-hidden="true"
        >
          {initials(person.name)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold" lang={person.textLocale} dir="auto">
          {person.name}
        </span>
        <span className="block truncate font-mono text-[11px] text-muted">{lifeYears(person, locale)}</span>
        {person.description && (
          <span className="block truncate text-[12px] text-muted" lang={person.textLocale} dir="auto">
            {person.description}
          </span>
        )}
      </span>
    </Link>
  );
}
