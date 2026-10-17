import type { Metadata } from "next";
import Link from "next/link";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = { title: "Page not found · History Timeline" };

/** For URLs outside /en and /ar that the proxy did not redirect. */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <main className="gutter mx-auto grid max-w-[760px] gap-4 py-16">
          <h1 className="m-0 font-display text-4xl font-bold">Page not found</h1>
          <p className="m-0 text-muted" lang="ar" dir="rtl">
            الصفحة غير موجودة
          </p>
          <p className="m-0">
            <Link href="/" className="btn-primary inline-block no-underline">
              History Timeline · خط الزمن
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
