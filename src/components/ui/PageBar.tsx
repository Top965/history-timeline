import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { Toolbar } from "./Toolbar";

/** Sticky bar on content pages: back to the timeline, a short label, theme and language. */
export function PageBar({ locale, label, alternateHref }: { locale: Locale; label?: string; alternateHref: string }) {
  const t = getMessages(locale);
  return (
    <div className="sticky top-0 z-[2] border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)]">
      <div className="gutter mx-auto flex max-w-[760px] items-center justify-between gap-2.5 py-2.5">
        <Link href={`/${locale}`} className="btn text-ink no-underline">
          <span className="inline-block rtl:-scale-x-100" aria-hidden="true">
            ←
          </span>{" "}
          {t.story.back}
        </Link>
        {label && <span className="hidden font-mono text-xs text-muted sm:inline">{label}</span>}
        <Toolbar locale={locale} alternateHref={alternateHref} />
      </div>
    </div>
  );
}
