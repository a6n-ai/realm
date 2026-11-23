import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { durationPackages } = await import("@/db/schema");
const { durationPackageService } = await import("@/lib/catalog/catalog.service");
const { getPauseLimitsForDisplay } = await import("../pause-limits.service");

// Display limits take the weeks argument, so the order id is never read.
const NO_ORDER = BigInt(0);

describe("pause limits display cache", () => {
  it("shows a changed package limit on the next read", async () => {
    const [pkg] = await db.select().from(durationPackages).limit(1);
    try {
      await getPauseLimitsForDisplay(NO_ORDER, pkg!.weeks);
      await durationPackageService.update(pkg!.publicId, { maxPauses: 7 });
      expect((await getPauseLimitsForDisplay(NO_ORDER, pkg!.weeks)).maxPauses).toBe(7);
    } finally {
      await durationPackageService.update(pkg!.publicId, { maxPauses: pkg!.maxPauses });
    }
  });
});
