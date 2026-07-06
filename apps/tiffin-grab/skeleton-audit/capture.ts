import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { ROUTES, resolve } from "./routes";
import { writeReport, type Row } from "./report";

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const OUT = "skeleton-audit/out";
mkdirSync(OUT, { recursive: true });
const rows: Row[] = [];

const skeletonSig = `() => {
  const nodes = document.querySelectorAll('[data-slot="skeleton"]');
  if (!nodes.length) return "";
  // signature = count + rounded bounding boxes, so a different skeleton layer differs
  return [...nodes].map(n => {
    const r = n.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(",");
  }).join("|");
}`;

// Dashboard routes are auth-gated; without a session they redirect to /login.
// AUDIT_PUBLIC_ONLY captures just the ungated routes (auth/marketing/public).
const routes = process.env.AUDIT_PUBLIC_ONLY
  ? ROUTES.filter((r) => !r.path.startsWith("/dashboard"))
  : ROUTES;

for (const route of routes) {
  for (const vp of VIEWPORTS) {
    test(`${route.label} @ ${vp.name}`, async ({ page, context }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      // slow profile so the stream tail lands late and skeletons linger
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024, latency: 400,
      });

      const url = resolve(route);
      const nav = page.goto(url, { waitUntil: "commit" }).catch(() => {});
      const sigs = new Set<string>();
      let frame = 0;
      // sample the skeleton layer a few times while the page streams
      for (let i = 0; i < 8; i++) {
        const sig = await page.evaluate<string>(skeletonSig).catch(() => "");
        if (sig && !sigs.has(sig)) {
          sigs.add(sig);
          frame++;
          await page.screenshot({ path: `${OUT}/${route.label}-${vp.name}-skeleton-${frame}.png` });
        }
        await page.waitForTimeout(150);
      }
      await nav;
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.screenshot({ path: `${OUT}/${route.label}-${vp.name}-loaded.png` });

      rows.push({
        label: route.label, viewport: vp.name, url,
        skeletonFrames: frame, doubleFlash: sigs.size > 1,
      });
      writeReport(rows, OUT);
    });
  }
}
