import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db/client";
import { organization } from "./db/schema";
import { proxy } from "./proxy";

// NextResponse.next({ request: { headers } }) forwards headers to the
// downstream Server Component request by re-encoding them onto the *response*
// as `x-middleware-request-<key>` (see next/dist/server/web/spec-extension/
// response.js `handleMiddlewareField`) — the framework decodes these back
// into the real request headers server-side. That's what we assert on here.
describe("proxy URL-based org resolution", () => {
  let matchedOrgId: string;
  let defaultOrgId: string;

  beforeAll(async () => {
    const [matched] = await db
      .insert(organization)
      .values({ name: "Test Client", clientCode: "testclient123" })
      .returning({ id: organization.id });
    matchedOrgId = matched.id;

    const [fallback] = await db
      .insert(organization)
      .values({ name: "Default Client", clientCode: "defaultclient123", isDefaultLocation: true })
      .returning({ id: organization.id });
    defaultOrgId = fallback.id;
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, matchedOrgId));
    await db.delete(organization).where(eq(organization.id, defaultOrgId));
  });

  it("sets x-realm-org-id when the URL segment matches a clientCode", async () => {
    const req = new NextRequest("http://localhost/testclient123/menu");
    const res = await proxy(req);
    expect(res?.headers.get("x-middleware-request-x-realm-org-id")).toBe(matchedOrgId);
  });

  it("falls back to the default-location org when the segment matches nothing", async () => {
    // Other seeded rows may also carry isDefaultLocation=true; the resolver
    // picks whichever the DB returns first, so scope this assertion to a
    // fixture-only org set by suppressing every other default beforehand.
    const otherDefaults = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.isDefaultLocation, true));
    await db
      .update(organization)
      .set({ isDefaultLocation: false })
      .where(eq(organization.isDefaultLocation, true));
    await db.update(organization).set({ isDefaultLocation: true }).where(eq(organization.id, defaultOrgId));
    try {
      const req = new NextRequest("http://localhost/nosuchcode/menu");
      const res = await proxy(req);
      expect(res?.headers.get("x-middleware-request-x-realm-org-id")).toBe(defaultOrgId);
    } finally {
      for (const { id } of otherDefaults) {
        await db.update(organization).set({ isDefaultLocation: true }).where(eq(organization.id, id));
      }
    }
  });

  // The dev DB may already carry a seeded default-location brand org (Task 2's
  // backfill), so "no default exists" has to suppress *every* current default,
  // not just the one this file created, then restore exactly what it found.
  async function withNoDefaultOrg<T>(fn: () => Promise<T>): Promise<T> {
    const existingDefaults = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.isDefaultLocation, true));
    await db.update(organization).set({ isDefaultLocation: false }).where(eq(organization.isDefaultLocation, true));
    try {
      return await fn();
    } finally {
      for (const { id } of existingDefaults) {
        await db.update(organization).set({ isDefaultLocation: true }).where(eq(organization.id, id));
      }
    }
  }

  it("redirects to /locations when nothing matches and no default exists", async () => {
    await withNoDefaultOrg(async () => {
      const req = new NextRequest("http://localhost/nosuchcode/menu");
      const res = await proxy(req);
      expect(res?.status).toBe(307);
      expect(res?.headers.get("location")).toContain("/locations");
    });
  });

  it("redirects to /locations when the root is hit with no default org", async () => {
    await withNoDefaultOrg(async () => {
      const req = new NextRequest("http://localhost/");
      const res = await proxy(req);
      expect(res?.status).toBe(307);
      expect(res?.headers.get("location")).toContain("/locations");
    });
  });
});
