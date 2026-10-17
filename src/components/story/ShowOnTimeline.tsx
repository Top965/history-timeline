"use client";

import Link from "next/link";
import { requestTimelineJump, timelineHash } from "@/components/timeline/jump";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

/** Goes back to the timeline centered on this event. */
export function ShowOnTimeline({ locale, year, span = 30 }: { locale: Locale; year: number; span?: number }) {
  const view = { center: year, span };
  return (
    <Link
      href={`/${locale}${timelineHash(view)}`}
      className="chip text-ink no-underline"
      onClick={() => requestTimelineJump(view)}
    >
      {getMessages(locale).story.showOnTimeline}
    </Link>
  );
}
