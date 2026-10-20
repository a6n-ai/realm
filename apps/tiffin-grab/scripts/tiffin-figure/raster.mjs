// Rasterizes the static figure into the first-paint WebPs the landing <img> serves
// (an SVG this detailed is slow to fetch and decode on a phone). Uses Chrome's own
// WebP encoder through Playwright, so it needs no image library.
// Run after build.mjs: node scripts/tiffin-figure/raster.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const pub = fileURLToPath(new URL("../../public/landing/", import.meta.url));
const svg = readFileSync(pub + "tiffin-figure-static.svg", "utf8");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.setContent("<!doctype html><body></body>");
for (const width of [720, 1440]) {
  const b64 = await page.evaluate(async ({ svg, width }) => {
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round((width * 640) / 720);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.86).split(",")[1];
  }, { svg, width });
  const file = `${pub}tiffin-figure-${width}.webp`;
  writeFileSync(file, Buffer.from(b64, "base64"));
  console.log(file, Math.round(Buffer.from(b64, "base64").length / 1024) + " KB");
}
await browser.close();
