"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ locale: string }>();
  const t = getMessages(isLocale(params.locale) ? params.locale : "en").error;
  useEffect(() => {
    // Server errors are logged with full detail on the server; this only notes the digest in the browser.
    console.error("Page error", error.digest ?? error.message);
  }, [error]);
  return (
    <main className="gutter mx-auto grid max-w-[760px] gap-4 py-16">
      <h1 className="m-0 font-display text-4xl font-bold">{t.title}</h1>
      <p className="m-0 text-muted">{t.body}</p>
      <p className="m-0">
        <button type="button" className="btn-primary" onClick={reset}>
          {t.retry}
        </button>
      </p>
    </main>
  );
}
