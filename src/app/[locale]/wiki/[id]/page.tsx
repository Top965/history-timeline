import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { WikiArticle } from "@/components/people/WikiArticle";
import { PageBar } from "@/components/ui/PageBar";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

/** Any Wikidata item can be opened here; the page is an empty shell that the browser fills. */
export async function generateStaticParams() {
  // Cache Components needs at least one entry.
  return [{ id: "Q193286" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  if (!isLocale(locale)) return {};
  // Wikipedia's text, not ours: keep it out of search engines.
  return { title: getMessages(locale).wikiArticle.kicker, robots: { index: false, follow: true } };
}

export default async function WikiArticlePage({ params }: PageProps<"/[locale]/wiki/[id]">) {
  const locale = await localeParam();
  const { id } = await params;
  if (!isLocale(locale) || !/^Q[1-9]\d{0,11}$/.test(id)) notFound();
  const other = locale === "ar" ? "en" : "ar";
  return (
    <>
      <PageBar locale={locale} alternateHref={`/${other}/wiki/${id}`} />
      <main className="gutter mx-auto grid max-w-[760px] grid-cols-[minmax(0,1fr)] gap-[22px] pt-6 pb-[60px]">
        <WikiArticle key={`${id}:${locale}`} wikidataId={id} locale={locale} />
      </main>
    </>
  );
}
