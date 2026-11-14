import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isPublicApi } from "../public-api";

const API_DIR = fileURLToPath(new URL("../../../app/api", import.meta.url));

/** Any of these in a route file means it authenticates (or is a factory that does). */
const AUTHENTICATES =
  /requireAdmin|requireStaff|requirePermission|currentUserId|getSession|withCronAuth|cronRoutes|cronJobRoute|adminRoute|adminIdRoute|guard:|auth\.api|authorizeChannel/;

/**
 * Routes that run behind the proxy's session-cookie gate alone: they are not public, and nothing in the
 * file checks who the caller is. Adding a route here is a decision that "any signed-in user may call this".
 */
const SESSION_GATED: Record<string, string> = {
  "/api/address/resolve": "Places lookup, rate limited by IP",
  "/api/address/suggest": "Places typeahead, rate limited by IP",
  "/api/files/[...key]": "static files are public by path; secured ones need the ak token",
  "/api/map/glyphs/[fontstack]/[range]": "map assets",
  "/api/map/sprites/[file]": "map assets",
  "/api/map/style": "map style",
  "/api/map/tiles/[z]/[x]/[y]": "map tiles",
};

function routes(dir: string, base = ""): { path: string; file: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return routes(join(dir, e.name), `${base}/${e.name}`);
    return /^route\.tsx?$/.test(e.name) ? [{ path: `/api${base}`, file: join(dir, e.name) }] : [];
  });
}

const all = routes(API_DIR);

describe("api auth", () => {
  it("finds the route files", () => expect(all.length).toBeGreaterThan(50));

  it("every route is public, authenticates itself, or is listed as session-gated", () => {
    const unguarded = all
      .filter((r) => !isPublicApi(r.path) && !AUTHENTICATES.test(readFileSync(r.file, "utf8")) && !(r.path in SESSION_GATED))
      .map((r) => r.path);
    expect(unguarded).toEqual([]);
  });

  it("session-gated entries are real, non-public routes that really lack a guard", () => {
    const byPath = new Map(all.map((r) => [r.path, r.file]));
    for (const path of Object.keys(SESSION_GATED)) {
      expect(byPath.has(path), `${path} no longer exists`).toBe(true);
      expect(isPublicApi(path), `${path} is public now`).toBe(false);
      expect(AUTHENTICATES.test(readFileSync(byPath.get(path)!, "utf8")), `${path} now has a guard`).toBe(false);
    }
  });
});
