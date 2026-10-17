import { locale as localeParam } from "next/root-params";
import { notFound } from "next/navigation";
import { Explorer } from "@/components/timeline/Explorer";
import { getTimelineData } from "@/lib/db/queries";
import { isLocale } from "@/lib/i18n/config";

export default async function TimelinePage() {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const data = await getTimelineData(locale);
  return (
    <main>
      <Explorer locale={locale} data={data} />
    </main>
  );
}
