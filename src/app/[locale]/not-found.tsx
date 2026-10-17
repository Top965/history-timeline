import Link from "next/link";
import { locale as localeParam } from "next/root-params";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

export default async function NotFound() {
  const raw = await localeParam();
  const locale = isLocale(raw) ? raw : "en";
  const t = getMessages(locale).notFound;
  return (
    <main className="gutter mx-auto grid max-w-[760px] gap-4 py-16">
      <h1 className="m-0 font-display text-4xl font-bold">{t.title}</h1>
      <p className="m-0 text-muted">{t.body}</p>
      <p className="m-0">
        <Link href={`/${locale}`} className="btn-primary inline-block no-underline">
          {t.home}
        </Link>
      </p>
    </main>
  );
}
