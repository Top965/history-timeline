import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const readout = (page: Page) => page.getByTestId("year-readout");
const timeline = (page: Page) => page.getByTestId("timeline");

async function search(page: Page, query: string) {
  const box = page.getByRole("combobox");
  await box.fill(query);
  await expect(page.getByRole("listbox")).toBeVisible();
}

test.describe("timeline", () => {
  test("redirects to the visitor's language", async ({ browser }) => {
    const ar = await browser.newContext({ locale: "ar-KW" });
    const page = await ar.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await ar.close();
  });

  test("shows the prototype's starting view", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("History Timeline");
    await expect(readout(page)).toHaveText("1880");
    await expect(page.getByText("Modern era")).toBeVisible();
    await expect(page.getByTestId("scale")).toHaveText("Showing 380 years");
    await expect(page.getByRole("button", { name: /^Modern/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("around-list").getByRole("link")).toHaveCount(6);
    await expect(timeline(page).getByRole("button", { name: /World War I, 1914 – 1918/ })).toBeVisible();
  });

  test("drags through time and zooms", async ({ page, isMobile }) => {
    test.skip(isMobile, "mouse drag and wheel are desktop gestures");
    await page.goto("/en");
    const box = (await timeline(page).boundingBox())!;
    const y = box.y + box.height - 20;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, y, { steps: 8 });
    await page.mouse.up();
    const after = Number(await readout(page).textContent());
    expect(after).toBeLessThan(1880);

    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => Number(await timeline(page).getAttribute("data-span"))).toBeLessThan(380);

    const zoomedIn = Number(await timeline(page).getAttribute("data-span"));
    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect
      .poll(async () => Number(await timeline(page).getAttribute("data-span")))
      .toBe(Math.round(zoomedIn * 2));
  });

  test("moves and zooms with the keyboard", async ({ page }) => {
    await page.goto("/en");
    await timeline(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect(readout(page)).toHaveText("1918");
    await page.keyboard.press("+");
    await expect(timeline(page)).toHaveAttribute("data-span", "266");
  });

  test("jumps to an era", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: /^Medieval/ }).click();
    await expect(page.getByText("Medieval era")).toBeVisible();
    await expect(readout(page)).toHaveText("975 CE");
  });

  test("searches a topic and opens its own timeline", async ({ page }) => {
    await page.goto("/en");
    await search(page, "egypt pyramids");
    const first = page.getByRole("option").first();
    await expect(first).toContainText("Topic");
    await expect(first).toContainText("Ancient Egypt");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/topics\/ancient-egypt$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ancient Egypt" })).toBeVisible();
    await expect(page.getByText("c. 3,100 BCE – 30 BCE").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByTestId("topic-events")).toContainText("Great Pyramid of Giza");
    // The home page stays mounted (hidden) after navigating, so pick the visible timeline.
    await expect(page.getByTestId("timeline").filter({ visible: true })).toBeVisible();
  });

  test("goes back from an event to the topic that opened it, and home from anywhere", async ({ page }) => {
    await page.goto("/en/topics/ancient-egypt");
    await page
      .getByTestId("topic-events")
      .getByRole("link", { name: /Great Pyramid of Giza/ })
      .click();
    await expect(page).toHaveURL(/\/en\/events\/great-pyramid-of-giza$/);
    const visible = (name: string | RegExp) => page.getByRole("link", { name }).filter({ visible: true });
    await visible(/^Back$/).click();
    await expect(page).toHaveURL(/\/en\/topics\/ancient-egypt$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ancient Egypt" })).toBeVisible();
    // The topic was opened directly, so its Back leads to the timeline, not to the event again.
    await expect(visible(/^Back$/)).toHaveAttribute("href", "/en");

    // Opened directly, Back goes to the timeline, as the home button always does.
    await page.goto("/en/events/great-pyramid-of-giza");
    await visible(/^Back$/).click();
    await expect(page).toHaveURL(/\/en$/);
    await page.goto("/en/topics/ancient-egypt");
    await visible("Main page").click();
    await expect(page).toHaveURL(/\/en$/);
  });

  test("searches years with BC and typos", async ({ page }) => {
    await page.goto("/en");
    await search(page, "44 BC");
    await expect(page.getByRole("option").first()).toContainText("44 BCE");
    await page.keyboard.press("Enter");
    await expect(readout(page)).toHaveText("44 BCE");

    await search(page, "otoman");
    await expect(page.getByRole("option").first()).toContainText("Ottoman Empire");

    await search(page, "palestine israel war");
    await expect(page.getByRole("option").first()).toContainText("Israeli–Palestinian conflict");

    await search(page, "qqqzzz");
    await expect(page.getByRole("listbox")).toContainText("No match yet");
  });

  test("opens a searched event's page", async ({ page }) => {
    await page.goto("/en");
    await search(page, "moon landing");
    await page.getByRole("option", { name: /Apollo 11 Moon landing/ }).click();
    await expect(page).toHaveURL(/\/en\/events\/apollo-11-moon-landing$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Apollo 11");
  });

  test("loads smaller events when zooming into another period", async ({ page }) => {
    await page.goto("/en#year=-1332&span=120");
    await expect(readout(page)).toHaveText("1,332 BCE");
    // Tutankhamun is a smaller event, so it only arrives with that period's events.
    await expect(timeline(page).getByRole("button", { name: /Tutankhamun becomes pharaoh/ })).toBeVisible();
  });

  test("finds a smaller event far from the opening view and opens it", async ({ page }) => {
    await page.goto("/en");
    await search(page, "tutankhamun");
    await page.getByRole("option", { name: /Tutankhamun becomes pharaoh/ }).click();
    await expect(page).toHaveURL(/\/en\/events\/tutankhamun-becomes-pharaoh$/);
  });

  test("looks up someone who isn't on the site yet and opens their page", async ({ page }) => {
    // Wikipedia isn't reachable from tests, so answer the two lookup calls here.
    await page.route("**/api/people/lookup?*", (route) =>
      route.fulfill({
        json: {
          candidates: [
            { wikidataId: "Q615", name: "Lionel Messi", description: "Argentine footballer", kind: "person" },
          ],
        },
      }),
    );
    let posted: unknown = null;
    await page.route("**/api/people", (route) => {
      posted = route.request().postDataJSON();
      return route.fulfill({ json: { slug: "lionel-messi", created: true } });
    });
    await page.goto("/en");
    await search(page, "messi");
    await page.getByRole("button", { name: "Not here? Find “messi” on Wikipedia" }).click();
    await expect(page.getByTestId("person-lookup")).toContainText("Argentine footballer");
    await page.getByRole("button", { name: "Add: Lionel Messi" }).click();
    await expect(page).toHaveURL(/\/en\/people\/lionel-messi$/);
    expect(posted).toEqual({ wikidataId: "Q615" });
  });

  test("finds an article that isn't on the site and reads it from Wikipedia", async ({ page }) => {
    await page.route("**/api/people/lookup?*", (route) =>
      route.fulfill({
        json: {
          candidates: [
            { wikidataId: "Q193286", name: "بروتوكولات حكماء صهيون", description: "وثيقة مزورة", kind: "article" },
          ],
        },
      }),
    );
    // Wikidata and Wikipedia, as the reader's browser would see them.
    await page.route("https://www.wikidata.org/**", (route) =>
      route.fulfill({
        json: {
          entities: {
            Q193286: {
              id: "Q193286",
              labels: { ar: { value: "بروتوكولات حكماء صهيون" } },
              descriptions: { ar: { value: "وثيقة مزورة معادية للسامية" } },
              claims: {
                P577: [{ mainsnak: { snaktype: "value", datavalue: { value: { time: "+1903-00-00T00:00:00Z" } } } }],
              },
              sitelinks: { arwiki: { title: "بروتوكولات حكماء صهيون" } },
            },
          },
        },
      }),
    );
    await page.route("https://ar.wikipedia.org/**", (route) =>
      route.fulfill({
        json: { query: { pages: [{ extract: "وثيقة مزيفة نُشرت عام 1903.\n\n\n== الأصل ==\nكتبها مخبر.\n" }] } },
      }),
    );
    await page.goto("/ar");
    await search(page, "بروتوكولات حكماء صهيون");
    await page.getByRole("button", { name: /^غير موجود هنا؟/ }).click();
    await page.getByRole("link", { name: "افتح: بروتوكولات حكماء صهيون" }).click();
    await expect(page).toHaveURL(/\/ar\/wiki\/Q193286$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("بروتوكولات حكماء صهيون");
    await expect(page.getByText("وثيقة مزورة معادية للسامية")).toBeVisible();
    await expect(page.getByTestId("article-dates")).toContainText("1903");
    await expect(page.getByText("وثيقة مزيفة نُشرت عام 1903.")).toBeVisible();
    await expect(page.getByTestId("article-sections")).toContainText("الأصل");
  });

  test("has no serious accessibility problems", async ({ page }) => {
    await page.goto("/en");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });

  for (const path of [
    "/en",
    "/ar",
    "/en/events/world-war-i",
    "/ar/events/great-pyramid-of-giza",
    "/en/topics/israeli-palestinian-conflict",
    "/ar/topics/fifa-world-cup",
  ]) {
    test(`${path} fits the screen without sideways scrolling`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("story pages", () => {
  test("opens World War I in the full story layout and goes back to the same place", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: /^Modern/ }).click();
    await expect(readout(page)).toHaveText("1867");
    await page
      .getByTestId("around-list")
      .getByRole("link", { name: /World War I/ })
      .click();

    await expect(page).toHaveURL(/\/en\/events\/world-war-i$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("World War I");
    await expect(page.getByText("28 Jul 1914 – 11 Nov 1918")).toBeVisible();
    await expect(page.getByText(/^Chapter \d of 7$/)).toHaveCount(7);
    await expect(page.getByRole("heading", { name: "Central Powers" })).toBeVisible();
    await expect(page.getByText("Sharif Hussein", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /1 Jul 1916/ }).click();
    await expect(page).toHaveURL(/#chapter-3$/);

    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(readout(page)).toHaveText("1867");
  });

  test("shows a short story with neighbours and returns to the event on the timeline", async ({ page }) => {
    await page.goto("/en/events/great-pyramid-of-giza");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Great Pyramid of Giza");
    await expect(page.getByText("c. 2,560 BCE").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("img", { name: "The Great Pyramid on the Giza plateau" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Upper and Lower Egypt unite/ })).toBeVisible();
    await page.getByRole("link", { name: "Show on timeline" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(readout(page)).toHaveText("2,560 BCE");
  });

  test("full story page has no serious accessibility problems", async ({ page }) => {
    await page.goto("/en/events/world-war-i");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });

  test("topic page has no serious accessibility problems", async ({ page }) => {
    await page.goto("/ar/topics/israeli-palestinian-conflict");
    await expect(page.getByRole("note")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });

  test("unknown events show the not-found page", async ({ page }) => {
    await page.goto("/en/events/no-such-event");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test.describe("Arabic and themes", () => {
  test("renders the Arabic site right to left", async ({ page }) => {
    await page.goto("/ar");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("خط الزمن");
    await expect(page.getByText("العصر الحديث").first()).toBeVisible();
    await search(page, "الدولة العثمانية");
    await expect(page.getByRole("option").first()).toContainText("الدولة العثمانية");

    await page.goto("/ar/events/world-war-i");
    await expect(page.getByRole("note")).toContainText("غير متوفر بالعربية");
    await expect(page.getByRole("link", { name: "رجوع", exact: true })).toBeVisible();
  });

  test("switches language from the toolbar", async ({ page }) => {
    await page.goto("/en/events/world-war-i");
    await page.getByRole("link", { name: /العربية/ }).click();
    await expect(page).toHaveURL(/\/ar\/events\/world-war-i$/);
  });

  test("shares a page through the phone's share menu, or copies its link", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { shared: unknown[] }).shared = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: unknown) => {
          (window as unknown as { shared: unknown[] }).shared.push(data);
        },
      });
    });
    await page.goto("/en/events/world-war-i#chapter-2");
    await page.getByRole("button", { name: "Share" }).click();
    const shared = await page.evaluate(
      () => (window as unknown as { shared: { url: string; title: string }[] }).shared,
    );
    expect(shared).toHaveLength(1);
    expect(shared[0].url).toMatch(/\/en\/events\/world-war-i$/);
    expect(shared[0].title).toContain("World War I");

    // Without a share menu (most desktop browsers) the link is copied.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (t: string) => ((window as unknown as { copied: string }).copied = t) },
      });
    });
    await page.goto("/ar");
    await page.getByRole("button", { name: "مشاركة" }).click();
    await expect(page.getByRole("status").filter({ hasText: "نُسخ الرابط" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toMatch(/\/ar$/);
  });

  test("remembers the chosen theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/en");
    const toggle = page.getByRole("button", { name: /^Theme:/ });
    await expect(toggle).toHaveAccessibleName("Theme: Auto");
    await toggle.click();
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(14, 20, 27)");
  });
});

test.describe("platform", () => {
  test("health check, manifest, sitemap and robots", async ({ request }) => {
    expect(await (await request.get("/api/health")).json()).toEqual({ status: "ok", database: "ok" });
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toHaveLength(3);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/ar/events/world-war-i");
    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap:");
  });
});
