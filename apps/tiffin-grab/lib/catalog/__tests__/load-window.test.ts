import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { discounts } from "@/db/schema";
import { discountService } from "@/lib/services/catalog.service";
import { invalidateCatalogSnapshot, loadCatalogSnapshot } from "../load";

const cleanup = () => db.delete(discounts).where(like(discounts.key, "zz-window-%"));

describe("catalog snapshot vs discount windows", () => {
  afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
    await invalidateCatalogSnapshot();
  });

  it("a cached snapshot is rebuilt once a discount window opens", async () => {
    await cleanup();
    const startsAt = Date.now() + 60_000;
    await discountService.create({ key: "zz-window-later", name: "Later", kind: "duration", percent: "5" });
    // The service takes a calendar date; set an exact instant so the test needs no day to pass.
    await db.update(discounts).set({ startsAt }).where(eq(discounts.key, "zz-window-later"));
    await invalidateCatalogSnapshot();

    const before = await loadCatalogSnapshot();
    expect(before.discounts?.some((d) => d.key === "zz-window-later")).toBe(false);
    expect(before.validUntil).not.toBeNull();
    expect(before.validUntil!).toBeLessThanOrEqual(startsAt);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(startsAt + 1_000);
    const after = await loadCatalogSnapshot();
    expect(after.discounts?.some((d) => d.key === "zz-window-later")).toBe(true);
  });
});
