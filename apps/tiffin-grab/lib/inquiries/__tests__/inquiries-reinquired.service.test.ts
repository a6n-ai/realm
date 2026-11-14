import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureSystemUser, deleteNonSystemUsers } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiryActivities, orders } from "@/db/schema";
import { insertTestInquiry, resetInquiryData } from "./helpers/inquiry-fixtures";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await resetInquiryData();
  await db.delete(orders);
  await deleteNonSystemUsers();
}
const D = Date.UTC(2026, 10, 14);
const page = { page: 0, size: 50 };

describe("re-inquired leads", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("records the source a re-inquiry came through", async () => {
    const open = await insertTestInquiry({ phone: "+16475557101" });
    await inquiriesService.createOrFold({ phone: "+16475557101", sourceKey: "facebook", subSourceKey: "facebook_feed" });
    const [re] = await db.select().from(inquiryActivities).where(eq(inquiryActivities.inquiryId, open.id));
    expect(re.details).toMatchObject({ source: "facebook", subSource: "facebook_feed" });
  });

  it("lists open re-inquired leads with count, latest source and heat, and keeps them out of the first-time list", async () => {
    const back = await insertTestInquiry({ phone: "+16475557102" });
    const fresh = await insertTestInquiry({ phone: "+16475557103" });
    await inquiriesService.createOrFold({ phone: "+16475557102", sourceKey: "manual" });
    await inquiriesService.createOrFold({ phone: "+16475557102", sourceKey: "website" });

    const rows = await inquiriesService.listReinquired(undefined, Date.now());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ publicId: back.publicId, count: 2, sourceKey: "website", heat: "hot" });

    const all = (await inquiriesService.listForPipeline(undefined, page)).items.map((r) => r.publicId);
    expect(all).toEqual(expect.arrayContaining([back.publicId, fresh.publicId]));
    const firstTime = (await inquiriesService.listForPipeline(undefined, page, undefined, { tab: "open", dayStart: D, dayEnd: D + 86_400_000 }, undefined, true)).items.map((r) => r.publicId);
    expect(firstTime).toEqual([fresh.publicId]);
    expect((await inquiriesService.queueCounts(undefined, D, D + 86_400_000, true)).open).toBe(1);
  });

  it("falls back to the note's source for re-inquiries saved before the source was recorded", async () => {
    const old = await insertTestInquiry({ phone: "+16475557104" });
    await db.insert(inquiryActivities).values({ inquiryId: old.id, type: "reinquiry", note: "Re-inquiry via Facebook (facebook_feed)", createdAt: Date.now() - 40 * 86_400_000 });
    const [r] = await inquiriesService.listReinquired(undefined, Date.now());
    expect(r).toMatchObject({ publicId: old.publicId, sourceKey: "facebook", heat: "cold" });
  });
});
