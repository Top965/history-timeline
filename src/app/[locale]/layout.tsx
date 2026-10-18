import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { siteUrl } from "@/lib/env";
import { fontVariables } from "@/lib/fonts";
import { dirOf, isLocale, LOCALES } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { NavTrail } from "@/components/ui/navTrail";
import { THEME_SCRIPT } from "@/components/ui/theme";
import "../globals.css";

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  if (!isLocale(locale)) return {};
  const t = getMessages(locale);
  return {
    metadataBase: siteUrl(),
    title: { default: `${t.brand} · ${t.brandAlt}`, template: `%s · ${t.brand}` },
    description: t.metaDescription,
    applicationName: t.brand,
    appleWebApp: { capable: true, title: t.brand, statusBarStyle: "default" },
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
    openGraph: { type: "website", siteName: t.brand, locale: locale === "ar" ? "ar_KW" : "en_US" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf0f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0e141b" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} dir={dirOf(locale)} className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Suspense fallback={null}>
          <NavTrail />
        </Suspense>
      </body>
    </html>
  );
}
