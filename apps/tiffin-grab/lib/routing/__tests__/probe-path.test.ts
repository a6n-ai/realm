import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import probePath from "../probe-path.json";
import { apexServes } from "../apex";
import publicPages from "../public-pages.json";

const PROBE = new RegExp(probePath.source, probePath.flags);

describe("scanner probe pattern", () => {
  it("blocks scanner paths and lets real pages through", () => {
    for (const p of ["/.env", "/.env.local", "/.git/config", "/wp-login.php", "/WP-ADMIN/x", "/.env?x=1"]) expect(PROBE.test(p), p).toBe(true);
    for (const p of ["/", "/menu", "/environment", "/api/health"]) expect(PROBE.test(p), p).toBe(false);
  });

  it("is the one source the worker and the proxy read", () => {
    expect(readFileSync("cloudflare/worker.js", "utf8")).toContain("lib/routing/probe-path.json");
    expect(readFileSync("proxy.ts", "utf8")).toContain("lib/routing/probe-path.json");
  });
});

describe("public page list", () => {
  it("every cacheable page is served by the apex", () => {
    for (const p of publicPages) expect(apexServes(p), p).toBe(true);
  });
});
