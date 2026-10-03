import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Box B's Caddy only forwards allowlisted paths to the app (everything else is
// answered 404 at the proxy so crawler junk never wakes the database). A new
// top-level route or public/ entry that is missing from that allowlist would
// 404 in prod only, so this keeps the two in step.
const appRoot = path.resolve(__dirname, "..");
const caddyfile = readFileSync(
  path.resolve(appRoot, "../../deployment/prod/puchkaman/proxy/conf/Caddyfile"),
  "utf8",
);

const notApp = (() => {
  const line = caddyfile.split("\n").find((l) => l.trim().startsWith("@notapp not path_regexp "));
  if (!line) throw new Error("@notapp matcher not found in the Caddyfile");
  return new RegExp(line.trim().slice("@notapp not path_regexp ".length));
})();
const reachesApp = (p: string) => notApp.test(p);

// Top-level URL segments from app/: route groups "(x)" and parallel slots "@x"
// don't appear in URLs, so descend through them.
function topLevelSegments(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (!statSync(full).isDirectory()) return [];
    if (/^\(.*\)$/.test(name) || name.startsWith("@")) return topLevelSegments(full);
    if (name.startsWith("_") || name.startsWith("[")) return [];
    return [name];
  });
}

describe("Caddy allowlist", () => {
  it.each(topLevelSegments(path.join(appRoot, "app")))("forwards /%s", (seg) => {
    expect(reachesApp(`/${seg}`)).toBe(true);
    expect(reachesApp(`/${seg}/x`)).toBe(true);
  });

  it.each(readdirSync(path.join(appRoot, "public")).filter((e) => !e.startsWith(".")))("forwards public/%s", (entry) => {
    expect(reachesApp(`/${entry}`)).toBe(true);
  });

  it("forwards Next internals, metadata routes and legacy redirects", () => {
    for (const p of ["/", "/_next/static/chunks/a.js", "/robots.txt", "/sitemap.xml", "/icon.png", "/menu", "/productsmenu"]) {
      expect(reachesApp(p), p).toBe(true);
    }
  });

  it("keeps junk paths off the app", () => {
    for (const p of ["/casino-with-best-payout/", "/wp-login.php", "/.env", "/eatsx", "/xmlrpc.php"]) {
      expect(reachesApp(p), p).toBe(false);
    }
  });
});
