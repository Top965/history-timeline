import { locale as localeParam } from "next/root-params";
import { notFound } from "next/navigation";
import { Explorer } from "@/components/timeline/Explorer";
import { getTimelineData, getTimelineTile } from "@/lib/db/queries";
import { isLocale } from "@/lib/i18n/config";
import { INITIAL_VIEW } from "@/lib/timeline/geometry";
import { tilesForView } from "@/lib/timeline/tiles";

export default async function TimelinePage() {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const data = await getTimelineData(locale);
  const initialTiles = await Promise.all(
    tilesForView(INITIAL_VIEW, data.currentYear).map((t) => getTimelineTile(locale, t.level, t.tile)),
  );
  return (
    <main>
      <Explorer locale={locale} data={data} initialTiles={initialTiles} />
    </main>
  );
}
