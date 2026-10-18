import type { Locale } from "@/lib/i18n/config";
import { PageNav } from "./PageNav";
import { Toolbar } from "./Toolbar";

/** Sticky bar on content pages: home and back (to the timeline or the page that led here), a short label, theme and language. */
export function PageBar({ locale, label, alternateHref }: { locale: Locale; label?: string; alternateHref: string }) {
  return (
    <div className="sticky top-0 z-[2] border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)]">
      <div className="gutter mx-auto flex max-w-[760px] items-center justify-between gap-2.5 py-2.5">
        <PageNav locale={locale} />
        {label && <span className="hidden font-mono text-xs text-muted sm:inline">{label}</span>}
        <Toolbar locale={locale} alternateHref={alternateHref} />
      </div>
    </div>
  );
}
