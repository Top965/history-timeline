import type { Locale } from "./config";

export type Messages = {
  brand: string;
  brandAlt: string;
  tagline: string;
  metaDescription: string;
  search: {
    label: string;
    placeholder: string;
    go: string;
    noMatch: string;
    types: { year: string; era: string; topic: string; event: string };
  };
  readout: { hint: string; era: (name: string) => string };
  eras: { label: string; now: string };
  focus: { kicker: string; clear: string };
  timeline: {
    label: string;
    zoomIn: string;
    zoomOut: string;
    today: string;
    showingYears: (n: number) => string;
  };
  around: {
    heading: string;
    inside: string;
    empty: string;
    fullStory: string;
  };
  story: {
    back: string;
    keyDates: string;
    tapDate: string;
    chapterOf: (i: number, n: number) => string;
    keyPeople: string;
    whatItLedTo: string;
    beforeAndAfter: string;
    showOnTimeline: string;
    when: string;
    where: string;
    era: string;
    shortNote: string;
    archivePhoto: string;
    archiveMap: string;
    reviewNote: string;
    notTranslated: string;
  };
  image: { source: string; by: string };
  theme: { label: string; system: string; light: string; dark: string };
  language: { label: string };
  footer: { credits: string };
  notFound: { title: string; body: string; home: string };
  error: { title: string; body: string; retry: string };
};

const en: Messages = {
  brand: "History Timeline",
  brandAlt: "خط الزمن",
  tagline: "Travel through history. Drag the timeline, tap any event.",
  metaDescription:
    "Explore all of history on one zoomable timeline: drag through time, zoom from eras to single years and read the full story of any event.",
  search: {
    label: "Search history",
    placeholder: "Search: world cup, egypt pyramids, 1969…",
    go: "Go",
    noMatch: "No match yet. Try a place, empire, war or year, like “ottoman”, “cold war” or “1969”.",
    types: { year: "Year", era: "Era", topic: "Topic", event: "Event" },
  },
  readout: {
    hint: "Drag left or right to move in time. Scroll, pinch or use + and − to zoom from eras down to single years.",
    era: (name) => `${name} era`,
  },
  eras: { label: "Jump to era", now: "now" },
  focus: { kicker: "Focused timeline", clear: "Clear" },
  timeline: {
    label: "Timeline. Use arrow keys to move, plus and minus to zoom.",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    today: "today",
    showingYears: (n) => `Showing ${n.toLocaleString("en-US")} ${n === 1 ? "year" : "years"}`,
  },
  around: {
    heading: "Around",
    inside: "Inside",
    empty: "No events in this stretch yet. Zoom out or pick an era.",
    fullStory: "Full story",
  },
  story: {
    back: "Back to timeline",
    keyDates: "Key dates",
    tapDate: "Tap a date to jump to that part of the story.",
    chapterOf: (i, n) => `Chapter ${i} of ${n}`,
    keyPeople: "Key people",
    whatItLedTo: "What it led to",
    beforeAndAfter: "Before and after",
    showOnTimeline: "Show on timeline",
    when: "When",
    where: "Where",
    era: "Era",
    shortNote:
      "This is the short version. Full stories with chapters, key people and maps are being written for every event.",
    archivePhoto: "Archive photo",
    archiveMap: "Archive map",
    reviewNote: "Text is drafted from Wikipedia and reviewed before publishing.",
    notTranslated: "",
  },
  image: { source: "Wikimedia Commons", by: "by" },
  theme: { label: "Theme", system: "Auto", light: "Light", dark: "Dark" },
  language: { label: "Language" },
  footer: {
    credits:
      "Event data from Wikidata (CC0). Story text adapted from Wikipedia (CC BY-SA 4.0). Images from Wikimedia Commons, credited on each image.",
  },
  notFound: {
    title: "Page not found",
    body: "We could not find that page. It may have moved, or the event has not been published yet.",
    home: "Go to the timeline",
  },
  error: {
    title: "Something went wrong",
    body: "The timeline could not load. Please try again.",
    retry: "Try again",
  },
};

const ar: Messages = {
  brand: "خط الزمن",
  brandAlt: "History Timeline",
  tagline: "سافر عبر التاريخ. اسحب الخط الزمني واضغط على أي حدث.",
  metaDescription:
    "استكشف التاريخ كله على خط زمني واحد: تنقّل عبر الزمن، وكبّر من العصور إلى السنوات، واقرأ القصة الكاملة لأي حدث.",
  search: {
    label: "ابحث في التاريخ",
    placeholder: "ابحث: كأس العالم، الأهرامات، 1969…",
    go: "اذهب",
    noMatch:
      "لا توجد نتائج بعد. جرّب مكانًا أو إمبراطورية أو حربًا أو سنة، مثل «العثمانية» أو «الحرب الباردة» أو «1969».",
    types: { year: "سنة", era: "عصر", topic: "موضوع", event: "حدث" },
  },
  readout: {
    hint: "اسحب يمينًا أو يسارًا للتنقل في الزمن. مرّر أو قرّب بإصبعين أو استخدم + و − للتكبير من العصور حتى السنة الواحدة.",
    era: (name) => name,
  },
  eras: { label: "انتقل إلى عصر", now: "الآن" },
  focus: { kicker: "خط زمني مركّز", clear: "مسح" },
  timeline: {
    label: "الخط الزمني. استخدم مفاتيح الأسهم للتنقل، وزائد وناقص للتكبير.",
    zoomIn: "تكبير",
    zoomOut: "تصغير",
    today: "اليوم",
    showingYears: (n) => `يعرض ${n} ${n >= 3 && n <= 10 ? "سنوات" : "سنة"}`,
  },
  around: {
    heading: "حول عام",
    inside: "داخل",
    empty: "لا توجد أحداث في هذه الفترة بعد. صغّر العرض أو اختر عصرًا.",
    fullStory: "قصة كاملة",
  },
  story: {
    back: "العودة إلى الخط الزمني",
    keyDates: "تواريخ رئيسية",
    tapDate: "اضغط على تاريخ للانتقال إلى ذلك الجزء من القصة.",
    chapterOf: (i, n) => `الفصل ${i} من ${n}`,
    keyPeople: "شخصيات رئيسية",
    whatItLedTo: "ما الذي أدّى إليه",
    beforeAndAfter: "قبل وبعد",
    showOnTimeline: "اعرضه على الخط الزمني",
    when: "متى",
    where: "أين",
    era: "العصر",
    shortNote: "هذه نسخة مختصرة. نكتب قصصًا كاملة بفصول وشخصيات وخرائط لكل حدث.",
    archivePhoto: "صورة أرشيفية",
    archiveMap: "خريطة أرشيفية",
    reviewNote: "النص مأخوذ من ويكيبيديا وتتم مراجعته قبل النشر.",
    notTranslated: "هذا المحتوى غير متوفر بالعربية بعد، ويُعرض بالإنجليزية.",
  },
  image: { source: "ويكيميديا كومنز", by: "تصوير" },
  theme: { label: "المظهر", system: "تلقائي", light: "فاتح", dark: "داكن" },
  language: { label: "اللغة" },
  footer: {
    credits:
      "بيانات الأحداث من ويكي بيانات (CC0). نصوص القصص مقتبسة من ويكيبيديا (CC BY-SA 4.0). الصور من ويكيميديا كومنز مع ذكر صاحب كل صورة.",
  },
  notFound: {
    title: "الصفحة غير موجودة",
    body: "لم نعثر على هذه الصفحة. ربما نُقلت، أو لم يُنشر الحدث بعد.",
    home: "اذهب إلى الخط الزمني",
  },
  error: {
    title: "حدث خطأ",
    body: "تعذّر تحميل الخط الزمني. يرجى المحاولة مرة أخرى.",
    retry: "أعد المحاولة",
  },
};

const MESSAGES: Record<Locale, Messages> = { en, ar };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
