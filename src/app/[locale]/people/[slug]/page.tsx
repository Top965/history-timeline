import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { PersonView } from "@/components/people/PersonView";
import { PageBar } from "@/components/ui/PageBar";
import { commonsThumbUrl } from "@/lib/commons/thumbnails";
import { getPersonPage, getPublishedPeopleSlugs, getTimelineData } from "@/lib/db/queries";
import { lifeYears } from "@/lib/format/years";
import { isLocale, LOCALES } from "@/lib/i18n/config";

/** The most covered people are built ahead of time; the rest on their first visit. */
const PRERENDER = 100;

export async function generateStaticParams() {
  const people = await getPublishedPeopleSlugs();
  // Cache Components needs at least one entry; an unknown slug prerenders the 404 page.
  return people.length ? people.slice(0, PRERENDER).map(({ slug }) => ({ slug })) : [{ slug: "none" }];
}

export async function generateMetadata({ params }: PageProps<"/[locale]/people/[slug]">): Promise<Metadata> {
  const locale = await localeParam();
  const { slug } = await params;
  if (!isLocale(locale)) return {};
  const page = await getPersonPage(locale, slug);
  if (!page) return {};
  const { person } = page;
  const path = `/people/${person.slug}`;
  const description = [lifeYears(person, locale), person.description].filter(Boolean).join(" · ");
  return {
    title: person.name,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}${path}`])),
    },
    openGraph: {
      type: "profile",
      title: person.name,
      description,
      images: person.image ? [{ url: commonsThumbUrl(person.image, 960), alt: person.name }] : undefined,
    },
  };
}

export default async function PersonPage({ params }: PageProps<"/[locale]/people/[slug]">) {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const { slug } = await params;
  const [page, data] = await Promise.all([getPersonPage(locale, slug), getTimelineData(locale)]);
  if (!page) notFound();
  const other = locale === "ar" ? "en" : "ar";
  return (
    <>
      <PageBar
        locale={locale}
        label={lifeYears(page.person, locale)}
        alternateHref={`/${other}/people/${page.person.slug}`}
      />
      <main>
        <PersonView locale={locale} page={page} data={data} />
      </main>
    </>
  );
}
