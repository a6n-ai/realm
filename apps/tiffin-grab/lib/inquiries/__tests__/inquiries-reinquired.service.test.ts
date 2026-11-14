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
const page = { page: 0, size: 50 };

describe("re-inquired leads in the list", () => {
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

  it("marks re-inquired rows in the list with count, latest source and heat; first-time rows have none", async () => {
    const back = await insertTestInquiry({ phone: "+16475557102" });
    const fresh = await insertTestInquiry({ phone: "+16475557103" });
    await inquiriesService.createOrFold({ phone: "+16475557102", sourceKey: "manual" });
    await inquiriesService.createOrFold({ phone: "+16475557102", sourceKey: "website" });

    const rows = (await inquiriesService.listForPipeline(undefined, page)).items;
    expect(rows.find((r) => r.publicId === back.publicId)?.reinquiry).toMatchObject({ count: 2, sourceLabel: "Website", heat: "hot" });
    expect(rows.find((r) => r.publicId === fresh.publicId)?.reinquiry).toBeNull();
  });

  it("falls back to the note's source for re-inquiries saved before the source was recorded", async () => {
    const old = await insertTestInquiry({ phone: "+16475557104" });
    await db.insert(inquiryActivities).values({ inquiryId: old.id, type: "reinquiry", note: "Re-inquiry via Facebook (facebook_feed)", createdAt: Date.now() - 40 * 86_400_000 });
    const [r] = (await inquiriesService.listForPipeline(undefined, page)).items;
    expect(r.reinquiry).toMatchObject({ count: 1, sourceLabel: "Facebook", heat: "cold" });
  });
});
