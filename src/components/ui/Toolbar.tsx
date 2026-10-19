"use client";

import { useState, useSyncExternalStore } from "react";
import { LOCALE_NAMES, type Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { applyThemeChoice, readThemeChoice, subscribeThemeChoice, type ThemeChoice } from "./theme";

const ORDER: ThemeChoice[] = ["system", "light", "dark"];

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    "aria-hidden": true,
  } as const;
  if (choice === "light")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (choice === "dark")
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </svg>
  );
}

export function ThemeToggle({ locale }: { locale: Locale }) {
  const t = getMessages(locale).theme;
  // The server renders "system"; the browser reads the saved choice.
  const choice = useSyncExternalStore(subscribeThemeChoice, readThemeChoice, () => "system" as const);

  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  const label = { system: t.system, light: t.light, dark: t.dark }[choice];

  return (
    <button
      type="button"
      className="btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
      aria-label={`${t.label}: ${label}`}
      title={`${t.label}: ${label}`}
      onClick={() => {
        applyThemeChoice(next);
      }}
    >
      <ThemeIcon choice={choice} />
      {/* Icon only on phones, to leave room for the share button. */}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** Plain link (full page load): each language has its own root layout with its own lang/dir. */
export function LanguageSwitch({ locale, href }: { locale: Locale; href: string }) {
  const other: Locale = locale === "ar" ? "en" : "ar";
  return (
    <a
      href={href}
      hrefLang={other}
      lang={other}
      className="btn px-2.5 py-1.5 text-xs"
      aria-label={`${getMessages(locale).language.label}: ${LOCALE_NAMES[other]}`}
      onClick={() => {
        document.cookie = `locale=${other}; path=/; max-age=31536000; SameSite=Lax`;
      }}
    >
      {LOCALE_NAMES[other]}
    </a>
  );
}

/**
 * Opens the phone's own share menu (WhatsApp, Messages…) with this page's link.
 * Where there is none (most desktop browsers), copies the link instead.
 */
export function ShareButton({ locale }: { locale: Locale }) {
  const t = getMessages(locale).share;
  const [note, setNote] = useState<string | null>(null);

  async function share() {
    const url = window.location.href.split("#")[0];
    const title = document.title;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNote(t.copied);
    } catch (err) {
      // Closing the share menu is not an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setNote(t.failed);
    }
    window.setTimeout(() => setNote(null), 2500);
  }

  return (
    <span className="relative">
      <button
        type="button"
        className="btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
        onClick={share}
        data-testid="share"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
        </svg>
        <span>{t.label}</span>
      </button>
      <span
        role="status"
        className={
          note
            ? "absolute end-0 top-full z-[3] mt-1.5 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-bg"
            : "sr-only"
        }
      >
        {note}
      </span>
    </span>
  );
}

export function Toolbar({ locale, alternateHref }: { locale: Locale; alternateHref: string }) {
  return (
    <div className="flex items-center gap-2">
      <ShareButton locale={locale} />
      <LanguageSwitch locale={locale} href={alternateHref} />
      <ThemeToggle locale={locale} />
    </div>
  );
}
