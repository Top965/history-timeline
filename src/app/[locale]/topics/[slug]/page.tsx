import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { TopicView } from "@/components/topics/TopicView";
import { PageBar } from "@/components/ui/PageBar";
import { getPublishedTopicSlugs, getTimelineData, getTopicPage } from "@/lib/db/queries";
import { formatRange } from "@/lib/format/years";
import { isLocale, LOCALES } from "@/lib/i18n/config";

export async function generateStaticParams() {
  const topics = await getPublishedTopicSlugs();
  return topics.length ? topics.map(({ slug }) => ({ slug })) : [{ slug: "none" }];
}

export async function generateMetadata({ params }: PageProps<"/[locale]/topics/[slug]">): Promise<Metadata> {
  const locale = await localeParam();
  const { slug } = await params;
  if (!isLocale(locale)) return {};
  const page = await getTopicPage(locale, slug);
  if (!page) return {};
  const path = `/topics/${page.topic.slug}`;
  return {
    title: page.topic.name,
    description: page.topic.summary,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}${path}`])),
    },
    openGraph: { type: "article", title: page.topic.name, description: page.topic.summary },
  };
}

export default async function TopicPage({ params }: PageProps<"/[locale]/topics/[slug]">) {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const { slug } = await params;
  const [page, data] = await Promise.all([getTopicPage(locale, slug), getTimelineData(locale)]);
  if (!page) notFound();
  const other = locale === "ar" ? "en" : "ar";
  return (
    <>
      <PageBar
        locale={locale}
        label={formatRange(page.topic, locale)}
        alternateHref={`/${other}/topics/${page.topic.slug}`}
      />
      <main>
        <TopicView locale={locale} page={page} data={data} />
      </main>
    </>
  );
}
