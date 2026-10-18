"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { cameFrom } from "./navTrail";

const noSubscribe = () => () => {};

/**
 * A home button to the main timeline, and Back to the page on this site that
 * led here, or to the timeline when the reader arrived from outside it. (A link
 * rather than history.back(), which would stop at in-page anchors first.)
 */
export function PageNav({ locale }: { locale: Locale }) {
  const t = getMessages(locale).story;
  // The server can't know where the reader came from; it renders the plain link.
  const home = `/${locale}`;
  const back = useSyncExternalStore(
    noSubscribe,
    () => {
      const prev = cameFrom(decodeURI(window.location.pathname));
      return prev && (prev === home || prev.startsWith(`${home}/`)) ? prev : home;
    },
    () => home,
  );
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Link
        href={home}
        className="btn inline-flex items-center px-2.5 text-ink no-underline"
        aria-label={t.home}
        title={t.home}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
        </svg>
      </Link>
      <Link href={back} className="btn whitespace-nowrap text-ink no-underline">
        <span className="inline-block rtl:-scale-x-100" aria-hidden="true">
          ←
        </span>{" "}
        {t.back}
      </Link>
    </div>
  );
}
