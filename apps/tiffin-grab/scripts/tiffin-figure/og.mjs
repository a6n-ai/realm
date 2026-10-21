// Writes app/opengraph-image.png (1200x630), the share card for every route, from the
// landing figure and the site's own type and colours. Run after raster.mjs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const pub = fileURLToPath(new URL("../../public/landing/", import.meta.url));
const out = fileURLToPath(new URL("../../app/opengraph-image.png", import.meta.url));
const figure = readFileSync(pub + "tiffin-figure-1440.webp").toString("base64");
const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,500;0,700;1,700&display=block" rel="stylesheet">
<style>
  body { margin: 0; width: 1200px; height: 630px; background: #FBF4E7; font-family: Poppins, sans-serif; color: #241F1B; display: grid; grid-template-columns: 560px 1fr; align-items: center; overflow: hidden; }
  .copy { padding: 0 0 0 72px; display: flex; flex-direction: column; gap: 22px; }
  .brand { font-weight: 700; font-size: 30px; letter-spacing: -0.02em; } .brand b { color: #FB801C; } .brand span { color: #185936; }
  h1 { margin: 0; font-size: 60px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; }
  h1 em { color: #B4470F; }
  p { margin: 0; font-size: 22px; font-weight: 500; color: #6E6558; }
  .fig { height: 630px; display: flex; align-items: center; justify-content: center; }
  .fig img { width: 640px; margin-left: -20px; }
</style></head><body>
  <div class="copy">
    <div class="brand"><b>Tiffin</b><span>Grab</span></div>
    <h1>Home-style food, packed the way you <em>eat.</em></h1>
    <p>Tiffin delivery across the GTA</p>
  </div>
  <div class="fig"><img src="data:image/webp;base64,${figure}" alt=""></div>
</body></html>`;
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log(out);
