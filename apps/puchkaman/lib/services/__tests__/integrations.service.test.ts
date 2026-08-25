import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { app, organization } from "@/db/schema";
import { getIntegrationsConfig, setIntegrationsConfig } from "../integrations.service";

// This test exercises the real DB-backed resolution chain: no active org ->
// falls back to the brand (isDefaultLocation) org's config, matching today's
// pre-org-hierarchy behavior exactly (additive, not a behavior change) until
// a real org switcher sets an active organization.
describe("getIntegrationsConfig", () => {
  let brandId: string;
  let priorDefaultIds: string[] = [];

  beforeAll(async () => {
    // Only one org should carry isDefaultLocation at a time (schema comment);
    // temporarily clear any pre-existing default (e.g. a seeded brand org) so
    // this test's insert is unambiguously the one `.limit(1)` picks up.
    const priorDefaults = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.isDefaultLocation, true));
    priorDefaultIds = priorDefaults.map((r) => r.id);
    for (const id of priorDefaultIds) {
      await db.update(organization).set({ isDefaultLocation: false }).where(eq(organization.id, id));
    }

    const [brand] = await db
      .insert(organization)
      .values({
        name: "Test Brand",
        clientCode: "test-brand-integrations",
        isDefaultLocation: true,
        integrationsConfig: {
          clover: {
            installed: true,
            connected: true,
            merchantId: "test-merchant",
            environment: "sandbox",
            region: "na",
            authMode: "oauth",
          },
        },
      })
      .returning({ id: organization.id });
    brandId = brand.id;
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, brandId));
    for (const id of priorDefaultIds) {
      await db.update(organization).set({ isDefaultLocation: true }).where(eq(organization.id, id));
    }
  });

  it("resolves the default-location org's config when no active org is set", async () => {
    const result = await getIntegrationsConfig();
    expect(result.clover?.merchantId).toBe("test-merchant");
  });

  it("keeps reads in sync with writes: setIntegrationsConfig updates what getIntegrationsConfig returns next", async () => {
    const before = await getIntegrationsConfig();
    expect(before.clover?.merchantId).toBe("test-merchant");

    // Prove desync is closed, not just that the write succeeded: restore the
    // pristine `app` row afterward so this test doesn't leak state into others.
    const [priorApp] = await db.select({ cfg: app.integrationsConfig }).from(app).limit(1);
    try {
      await setIntegrationsConfig({
        clover: {
          installed: true,
          connected: true,
          merchantId: "rotated-merchant",
          environment: "sandbox",
          region: "na",
          authMode: "oauth",
        },
      });

      const after = await getIntegrationsConfig();
      expect(after.clover?.merchantId).toBe("rotated-merchant");
    } finally {
      if (priorApp) {
        await db.update(app).set({ integrationsConfig: priorApp.cfg });
      }
    }
  });
});
