// Renders the PWA icons from scripts/assets/icon.svg with headless Chromium.
// Usage: node scripts/assets/render-icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const svg = readFileSync(resolve(root, "scripts/assets/icon.svg"), "utf8");
// CHROMIUM_PATH lets environments with a preinstalled browser skip the Playwright download.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const targets = [
  { file: "public/icons/icon-192.png", size: 192, pad: 0, radius: true },
  { file: "public/icons/icon-512.png", size: 512, pad: 0, radius: true },
  { file: "public/icons/icon-maskable-512.png", size: 512, pad: 0.1, radius: false },
  { file: "src/app/apple-icon.png", size: 180, pad: 0, radius: false },
];
for (const t of targets) {
  const inner = t.radius ? svg : svg.replace('rx="112" ', "");
  const inset = Math.round(t.size * t.pad);
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${t.radius ? "transparent" : "#15202b"}"><div style="width:${t.size - inset * 2}px;height:${t.size - inset * 2}px;margin:${inset}px">${inner.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body></html>`,
  );
  await page.screenshot({ path: resolve(root, t.file), omitBackground: t.radius });
  console.log("wrote", t.file);
}
await browser.close();
