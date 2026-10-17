import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { StoryView } from "@/components/story/StoryView";
import { Toolbar } from "@/components/ui/Toolbar";
import { commonsThumbUrl } from "@/lib/commons/thumbnails";
import { getEventPage, getPublishedEventSlugs } from "@/lib/db/queries";
import { formatEventYears } from "@/lib/format/years";
import { isLocale, LOCALES } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

export async function generateStaticParams() {
  const events = await getPublishedEventSlugs();
  return events.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/events/[slug]">): Promise<Metadata> {
  const locale = await localeParam();
  const { slug } = await params;
  if (!isLocale(locale)) return {};
  const page = await getEventPage(locale, slug);
  if (!page) return {};
  const { event } = page;
  const path = `/events/${event.slug}`;
  return {
    title: event.title,
    description: event.summary,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}${path}`])),
    },
    openGraph: {
      type: "article",
      title: event.title,
      description: event.summary,
      images: page.hero ? [{ url: commonsThumbUrl(page.hero, 1280), alt: page.hero.alt }] : undefined,
    },
  };
}

export default async function EventPage({ params }: PageProps<"/[locale]/events/[slug]">) {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const { slug } = await params;
  const page = await getEventPage(locale, slug);
  if (!page) notFound();
  const t = getMessages(locale);
  const other = locale === "ar" ? "en" : "ar";

  return (
    <>
      <div className="sticky top-0 z-[2] border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)]">
        <div className="gutter mx-auto flex max-w-[760px] items-center justify-between gap-2.5 py-2.5">
          <Link href={`/${locale}`} className="btn text-ink no-underline">
            <span className="inline-block rtl:-scale-x-100" aria-hidden="true">
              ←
            </span>{" "}
            {t.story.back}
          </Link>
          <span className="hidden font-mono text-xs text-muted sm:inline">{formatEventYears(page.event, locale)}</span>
          <Toolbar locale={locale} alternateHref={`/${other}/events/${page.event.slug}`} />
        </div>
      </div>
      <main>
        <StoryView locale={locale} page={page} />
      </main>
    </>
  );
}
