import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}

describe("inquiriesService.findOpenByPhone", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns open inquiries for a phone, newest first, with source key+label", async () => {
    const phone = "+16475552000";
    await inquiriesService.create({ fullName: "Lead A", phone, sourceKey: "facebook" });
    await inquiriesService.create({ fullName: "Lead A2", phone, sourceKey: "manual" });
    const rows = await inquiriesService.findOpenByPhone(phone);
    expect(rows).toHaveLength(2);
    expect(rows[0].sourceKey).toBe("manual"); // newest first
    expect(rows[0].sourceLabel).toBeTruthy();
    expect(rows[0].stage).toBe("new");
  });

  it("excludes converted and lost inquiries", async () => {
    const phone = "+16475552001";
    const open = await inquiriesService.create({ fullName: "Open", phone, sourceKey: "facebook" });
    const lost = await inquiriesService.create({ fullName: "Lost", phone, sourceKey: "manual" });
    await inquiriesService.markLost(lost.publicId, "no_response");
    const rows = await inquiriesService.findOpenByPhone(phone);
    expect(rows.map((r) => r.publicId)).toEqual([open.publicId]);
  });

  it("returns empty for an unknown phone", async () => {
    expect(await inquiriesService.findOpenByPhone("+16470000000")).toEqual([]);
  });
});
