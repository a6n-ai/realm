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

  it("strips a client-supplied x-realm-org-id on /dashboard instead of forwarding it", async () => {
    const req = new NextRequest("http://localhost/dashboard/orders", {
      headers: { cookie: "better-auth.session_token=fake", "x-realm-org-id": matchedOrgId },
    });
    const res = await proxy(req);
    expect(res?.headers.get("x-middleware-request-x-realm-org-id")).toBeNull();
  });

  it("strips a client-supplied x-realm-org-id on /api instead of forwarding it", async () => {
    const req = new NextRequest("http://localhost/api/auth/session", {
      headers: { "x-realm-org-id": matchedOrgId },
    });
    const res = await proxy(req);
    expect(res?.headers.get("x-middleware-request-x-realm-org-id")).toBeNull();
  });

  it("falls back to the default-location org when the segment matches nothing", async () => {
    // Other seeded rows may also carry isDefaultLocation=true; the resolver
    // picks whichever the DB returns first, so scope this assertion to a
    // fixture-only org set by suppressing every other default beforehand.
    // Safe table-wide UPDATE: vitest.config.ts's `fileParallelism: false`
    // means no other test file is touching this table concurrently, and only
    // the ids this block tracks get restored (see withNoDefaultOrg above).
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

  // The dev DB may carry a real seeded default-location brand org (Task 2's
  // backfill — see db/seed-brand-org.ts), so simulating "no default exists"
  // has no way around suppressing every currently-true row: the resolver's
  // fallback query has no per-test scoping to key off. That table-wide UPDATE
  // is safe here because vitest.config.ts sets `fileParallelism: false` for
  // this suite — test files run one at a time, never racing each other on
  // this table — so the only tracked ids restored are the exact rows this
  // helper flipped, not a blanket "restore everything" that could clobber a
  // concurrently-running file's own state.
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
