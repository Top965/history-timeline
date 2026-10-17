import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { StoryView } from "@/components/story/StoryView";
import { PageBar } from "@/components/ui/PageBar";
import { commonsThumbUrl } from "@/lib/commons/thumbnails";
import { getEventPage, getPublishedEventSlugs } from "@/lib/db/queries";
import { formatEventYears } from "@/lib/format/years";
import { isLocale, LOCALES } from "@/lib/i18n/config";

/** Only the biggest events are built ahead of time; the rest are built on their first visit and cached. */
export async function generateStaticParams() {
  const events = await getPublishedEventSlugs();
  const top = events.filter((e) => e.importance === 1);
  return (top.length ? top : events).map(({ slug }) => ({ slug }));
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
  const other = locale === "ar" ? "en" : "ar";

  return (
    <>
      <PageBar
        locale={locale}
        label={formatEventYears(page.event, locale)}
        alternateHref={`/${other}/events/${page.event.slug}`}
      />
      <main>
        <StoryView locale={locale} page={page} />
      </main>
    </>
  );
}
