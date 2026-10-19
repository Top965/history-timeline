import type { Locale } from "./config";
import type { DataNote } from "@/lib/people/notes";
import type { TopicKind } from "@/lib/content/types";

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
    searching: string;
    failed: string;
    types: { year: string; era: string; topic: string; event: string; person: string };
    lookup: {
      prompt: (q: string) => string;
      looking: string;
      none: string;
      add: string;
      adding: string;
      limited: string;
      cannotAdd: string;
      failed: string;
      open: string;
    };
  };
  wikiArticle: {
    kicker: string;
    loading: string;
    failed: string;
    noArticle: string;
    notOnTimeline: string;
    source: string;
    dates: Record<"published" | "inception" | "pointInTime" | "start" | "end", string>;
  };
  readout: { hint: string; era: (name: string) => string };
  eras: { label: string; now: string };
  timeline: {
    label: string;
    zoomIn: string;
    zoomOut: string;
    today: string;
    showingYears: (n: number) => string;
  };
  around: {
    heading: string;
    empty: string;
    fullStory: string;
  };
  story: {
    back: string;
    home: string;
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
  person: {
    kicker: string;
    born: string;
    died: string;
    age: (years: number) => string;
    biography: string;
    life: string;
    lifeHint: string;
    world: string;
    worldHeading: string;
    worldHint: (range: string) => string;
    showWorld: string;
    hideWorld: string;
    topics: string;
    kinds: Record<"birth" | "death" | "position" | "conflict" | "team" | "award" | "event", string>;
    now: string;
    notRecorded: string;
    placeNotRecorded: string;
    autoAdded: string;
    aboutData: string;
    factsFrom: string;
    wikidataEntry: string;
    neverInvented: string;
    profile: {
      heading: string;
      facts: Record<import("@/lib/wiki/profile").FactKey, string>;
      career: string;
      years: string;
      team: string;
      apps: string;
      goals: string;
      honours: string;
      article: string;
      articleHint: string;
      loading: string;
      failed: string;
      openWikipedia: string;
    };
    notes: Record<DataNote, string>;
  };
  topic: {
    kicker: string;
    eventCount: (n: number) => string;
    people: string;
    events: string;
    sensitive: string;
    empty: string;
    readMore: string;
    kinds: Record<TopicKind, string>;
    /** Why a country, people group or religion page may be missing things. */
    groupNote: string;
    shownOf: (shown: number, total: number) => string;
    peopleShownOf: (shown: number, total: number) => string;
    source: string;
    via: (via: string) => string;
    successors: string;
    predecessors: string;
  };
  credit: { fromWikipedia: string; license: string };
  related: { people: string; topics: string };
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
    placeholder: "Search: Albert Einstein, World War II, Egypt…",
    go: "Go",
    noMatch: "No match yet. Try a place, empire, war or year, like “ottoman”, “cold war” or “1969”.",
    searching: "Searching…",
    failed: "Search isn’t working right now. Please try again.",
    types: { year: "Year", era: "Era", topic: "Topic", event: "Event", person: "Person" },
    lookup: {
      prompt: (q) => `Not here? Find “${q}” on Wikipedia`,
      looking: "Looking on Wikipedia…",
      none: "Nothing by that name on Wikipedia that isn’t already here.",
      add: "Add",
      adding: "Building their timeline…",
      limited: "Too many people added just now. Please try again later.",
      cannotAdd:
        "We can’t make a reliable timeline for this person yet: their birth year is missing or their dates don’t add up.",
      failed: "That didn’t work. Please try again.",
      open: "Open",
    },
  },
  wikiArticle: {
    kicker: "Wikipedia article",
    source: "Dates from",
    loading: "Loading the article from Wikipedia…",
    failed: "Wikipedia couldn’t be reached just now. Please try again.",
    noArticle: "Wikipedia has no article about this.",
    notOnTimeline:
      "This isn’t on the timeline yet. Below is Wikipedia’s own article, with the dates Wikidata gives for it.",
    dates: { published: "Published", inception: "Created", pointInTime: "Date", start: "Began", end: "Ended" },
  },
  readout: {
    hint: "Drag left or right to move in time. Scroll, pinch or use + and − to zoom from eras down to single years.",
    era: (name) => `${name} era`,
  },
  eras: { label: "Jump to era", now: "now" },
  timeline: {
    label: "Timeline. Use arrow keys to move, plus and minus to zoom.",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    today: "today",
    showingYears: (n) => `Showing ${n.toLocaleString("en-US")} ${n === 1 ? "year" : "years"}`,
  },
  around: {
    heading: "Around",
    empty: "No events in this stretch yet. Zoom out or pick an era.",
    fullStory: "Full story",
  },
  story: {
    back: "Back",
    home: "Main page",
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
  person: {
    kicker: "Person",
    born: "Born",
    died: "Died",
    age: (n) => `aged ${n}`,
    biography: "Biography",
    life: "Life timeline",
    lifeHint: "Their life from birth to death. On the timeline, world events of the time are shown faintly.",
    world: "In the world",
    worldHeading: "Meanwhile in the world",
    worldHint: (range) => `Major world events during their lifetime (${range}).`,
    showWorld: "Show world events",
    hideWorld: "Hide world events",
    topics: "Part of",
    kinds: {
      birth: "Born",
      death: "Died",
      position: "Role",
      conflict: "War",
      team: "Team",
      award: "Award",
      event: "Took part",
    },
    now: "present",
    notRecorded: "Not recorded",
    placeNotRecorded: "place not recorded",
    autoAdded:
      "This page was made automatically from Wikipedia and Wikidata when someone searched for this person. We haven’t checked it yet, so some details may be missing or wrong.",
    aboutData: "About this information",
    factsFrom: "Dates and life events come from this person’s",
    wikidataEntry: "Wikidata entry",
    neverInvented:
      "We only show events that the sources give a date for. Anything without a date is left out rather than guessed.",
    profile: {
      heading: "Profile",
      facts: {
        fullName: "Full name",
        height: "Height",
        positions: "Positions",
        occupation: "Occupation",
        citizenship: "Citizenship",
        currentTeam: "Current team",
        number: "Number",
        notableWorks: "Notable works",
        education: "Education",
      },
      career: "Career",
      years: "Years",
      team: "Team",
      apps: "Apps",
      goals: "Goals",
      honours: "Honours",
      article: "From Wikipedia",
      articleHint: "The full article, section by section.",
      loading: "Loading from Wikipedia and Wikidata…",
      failed: "Couldn’t load more details right now.",
      openWikipedia: "Read on Wikipedia",
    },
    notes: {
      "birth-date-disputed": "Sources disagree about the year of birth.",
      "death-not-recorded": "No date of death is recorded, although they were born long ago.",
      "birthplace-not-recorded": "The place of birth is not recorded.",
      "few-dated-facts": "No dated events from their life are recorded yet, beyond birth and death.",
      "no-biography": "There is no Wikipedia summary to show yet.",
    },
  },
  topic: {
    kicker: "Topic timeline",
    eventCount: (n) => `${n} ${n === 1 ? "event" : "events"}`,
    people: "Key people",
    events: "Everything that happened",
    sensitive:
      "This topic is contested. Event names and summaries follow Wikipedia, and each event links to its source article.",
    empty: "Events for this topic are being added.",
    readMore: "Read more",
    kinds: {
      topic: "Topic timeline",
      country: "Country",
      former_country: "Former state",
      people: "People group",
      religion: "Religion or belief",
    },
    groupNote:
      "Built from Wikidata: an event or person is listed when Wikidata links them to this page, as shown next to each one. Many aren’t recorded there, so this list is incomplete.",
    shownOf: (shown, total) => `Showing the ${shown} best-known of ${total} events.`,
    peopleShownOf: (shown, total) => `Showing the ${shown} best-known of ${total} people.`,
    source: "Source: Wikidata",
    via: (via) =>
      ({
        P17: "country",
        "P276>P17": "country of the location",
        "P19>P17": "country of birthplace",
        P27: "citizenship",
        P140: "religion",
        P172: "ethnic group",
      })[via] ?? via,
    successors: "Countries on this land today",
    predecessors: "Earlier states here",
  },
  credit: { fromWikipedia: "Text from the Wikipedia article", license: "CC BY-SA 4.0" },
  related: { people: "People", topics: "Topics" },
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
    placeholder: "ابحث: ألبرت أينشتاين، الحرب العالمية الثانية، مصر…",
    go: "اذهب",
    noMatch:
      "لا توجد نتائج بعد. جرّب مكانًا أو إمبراطورية أو حربًا أو سنة، مثل «العثمانية» أو «الحرب الباردة» أو «1969».",
    searching: "جارٍ البحث…",
    failed: "البحث لا يعمل الآن. حاول مرة أخرى.",
    types: { year: "سنة", era: "عصر", topic: "موضوع", event: "حدث", person: "شخصية" },
    lookup: {
      prompt: (q) => `غير موجود هنا؟ ابحث عن «${q}» في ويكيبيديا`,
      looking: "جارٍ البحث في ويكيبيديا…",
      none: "لا يوجد في ويكيبيديا شيء بهذا الاسم غير موجود هنا.",
      add: "أضف",
      adding: "جارٍ بناء خطه الزمني…",
      limited: "أُضيف عدد كبير من الأشخاص للتو. حاول مرة أخرى لاحقًا.",
      cannotAdd: "لا يمكننا إنشاء خط زمني موثوق لهذا الشخص بعد: سنة ميلاده غير معروفة أو تواريخه غير متّسقة.",
      failed: "لم ينجح ذلك. حاول مرة أخرى.",
      open: "افتح",
    },
  },
  wikiArticle: {
    kicker: "مقالة من ويكيبيديا",
    source: "مصدر التواريخ",
    loading: "جارٍ تحميل المقالة من ويكيبيديا…",
    failed: "تعذّر الوصول إلى ويكيبيديا الآن. حاول مرة أخرى.",
    noArticle: "لا توجد في ويكيبيديا مقالة عن هذا.",
    notOnTimeline: "هذا ليس على الخط الزمني بعد. فيما يلي مقالة ويكيبيديا نفسها، مع التواريخ التي يذكرها ويكي بيانات.",
    dates: { published: "النشر", inception: "الإنشاء", pointInTime: "التاريخ", start: "البداية", end: "النهاية" },
  },
  readout: {
    hint: "اسحب يمينًا أو يسارًا للتنقل في الزمن. مرّر أو قرّب بإصبعين أو استخدم + و − للتكبير من العصور حتى السنة الواحدة.",
    era: (name) => name,
  },
  eras: { label: "انتقل إلى عصر", now: "الآن" },
  timeline: {
    label: "الخط الزمني. استخدم مفاتيح الأسهم للتنقل، وزائد وناقص للتكبير.",
    zoomIn: "تكبير",
    zoomOut: "تصغير",
    today: "اليوم",
    showingYears: (n) => `يعرض ${n} ${n >= 3 && n <= 10 ? "سنوات" : "سنة"}`,
  },
  around: {
    heading: "حول عام",
    empty: "لا توجد أحداث في هذه الفترة بعد. صغّر العرض أو اختر عصرًا.",
    fullStory: "قصة كاملة",
  },
  story: {
    back: "رجوع",
    home: "الصفحة الرئيسية",
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
  person: {
    kicker: "شخصية",
    born: "الولادة",
    died: "الوفاة",
    age: (n) => `عن عمر ${n} سنة`,
    biography: "السيرة",
    life: "الخط الزمني لحياته",
    lifeHint: "حياته من الولادة حتى الوفاة. تظهر أحداث العالم في ذلك الوقت على الخط الزمني بلون خافت.",
    world: "في العالم",
    worldHeading: "في العالم آنذاك",
    worldHint: (range) => `أبرز أحداث العالم خلال حياته (${range}).`,
    showWorld: "اعرض أحداث العالم",
    hideWorld: "أخفِ أحداث العالم",
    topics: "ضمن",
    kinds: {
      birth: "الولادة",
      death: "الوفاة",
      position: "منصب",
      conflict: "حرب",
      team: "فريق",
      award: "جائزة",
      event: "شارك في",
    },
    now: "حتى الآن",
    notRecorded: "غير مسجّل",
    placeNotRecorded: "المكان غير مسجّل",
    autoAdded:
      "أُنشئت هذه الصفحة تلقائيًا من ويكيبيديا وويكي بيانات عندما بحث أحدهم عن هذا الشخص. لم نراجعها بعد، لذا قد تكون بعض التفاصيل ناقصة أو غير دقيقة.",
    aboutData: "عن هذه المعلومات",
    factsFrom: "التواريخ وأحداث الحياة مأخوذة من",
    wikidataEntry: "صفحته في ويكي بيانات",
    neverInvented: "نعرض فقط الأحداث التي تذكر المصادر تاريخها. ما ليس له تاريخ نتركه ولا نخمّنه.",
    profile: {
      heading: "نبذة",
      facts: {
        fullName: "الاسم الكامل",
        height: "الطول",
        positions: "المركز",
        occupation: "المهنة",
        citizenship: "الجنسية",
        currentTeam: "الفريق الحالي",
        number: "الرقم",
        notableWorks: "أبرز الأعمال",
        education: "التعليم",
      },
      career: "المسيرة",
      years: "السنوات",
      team: "الفريق",
      apps: "مباريات",
      goals: "أهداف",
      honours: "الإنجازات",
      article: "من ويكيبيديا",
      articleHint: "المقال كاملًا، قسمًا قسمًا.",
      loading: "جارٍ التحميل من ويكيبيديا وويكي بيانات…",
      failed: "تعذّر تحميل مزيد من التفاصيل الآن.",
      openWikipedia: "اقرأ في ويكيبيديا",
    },
    notes: {
      "birth-date-disputed": "تختلف المصادر في سنة الولادة.",
      "death-not-recorded": "لا يوجد تاريخ وفاة مسجّل، رغم أنه وُلد منذ زمن بعيد.",
      "birthplace-not-recorded": "مكان الولادة غير مسجّل.",
      "few-dated-facts": "لا توجد بعد أحداث مؤرّخة من حياته غير الولادة والوفاة.",
      "no-biography": "لا يوجد ملخص من ويكيبيديا بعد.",
    },
  },
  topic: {
    kicker: "خط زمني لموضوع",
    eventCount: (n) => (n === 1 ? "حدث واحد" : n === 2 ? "حدثان" : `${n} ${n >= 3 && n <= 10 ? "أحداث" : "حدثًا"}`),
    people: "شخصيات رئيسية",
    events: "كل ما حدث",
    sensitive: "هذا موضوع خلافي. أسماء الأحداث وملخصاتها مأخوذة من ويكيبيديا، وكل حدث مرتبط بمقالته المصدر.",
    empty: "نعمل على إضافة أحداث هذا الموضوع.",
    readMore: "اقرأ المزيد",
    kinds: {
      topic: "خط زمني لموضوع",
      country: "دولة",
      former_country: "دولة سابقة",
      people: "شعب",
      religion: "دين أو معتقد",
    },
    groupNote:
      "مبنية من ويكي بيانات: يظهر الحدث أو الشخص هنا عندما تربطه ويكي بيانات بهذه الصفحة، كما هو مبيَّن بجانب كل منهم. كثيرون غير مسجلين هناك، لذا هذه القائمة غير مكتملة.",
    shownOf: (shown, total) => `نعرض أشهر ${shown} من أصل ${total} حدثًا.`,
    peopleShownOf: (shown, total) => `نعرض أشهر ${shown} من أصل ${total} شخصًا.`,
    source: "المصدر: ويكي بيانات",
    via: (via) =>
      ({
        P17: "الدولة",
        "P276>P17": "دولة المكان",
        "P19>P17": "دولة مكان الولادة",
        P27: "الجنسية",
        P140: "الدين",
        P172: "المجموعة العرقية",
      })[via] ?? via,
    successors: "الدول القائمة على هذه الأرض اليوم",
    predecessors: "دول سابقة هنا",
  },
  credit: { fromWikipedia: "النص من مقالة ويكيبيديا", license: "CC BY-SA 4.0" },
  related: { people: "شخصيات", topics: "مواضيع" },
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
