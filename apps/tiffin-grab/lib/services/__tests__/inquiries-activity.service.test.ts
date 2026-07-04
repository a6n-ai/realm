import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, users } from "@/db/schema";
import { ValidationError } from "@tiffin/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  session.user = null;
}

async function makeInquiry() {
  return inquiriesService.create({ fullName: "Lead A", phone: "+16475553000", sourceKey: "manual" });
}

describe("inquiriesService.logActivity + markLost", () => {
  beforeEach(reset);
  afterAll(reset);

  it("logActivity inserts a typed activity with outcome + nextFollowUpAt", async () => {
    const inq = await makeInquiry();
    const followUp = Date.now() + 86_400_000;
    await inquiriesService.logActivity(inq.publicId, {
      type: "call",
      outcome: "Reached, interested",
      note: "Will decide next week",
      nextFollowUpAt: followUp,
    });
    const [row] = await db
      .select()
      .from(inquiryActivities)
      .where(eq(inquiryActivities.inquiryId, inq.id))
      .orderBy(desc(inquiryActivities.createdAt))
      .limit(1);
    expect(row.type).toBe("call");
    expect(row.outcome).toBe("Reached, interested");
    expect(row.note).toBe("Will decide next week");
    expect(row.nextFollowUpAt).toBe(followUp);
  });

  it("markLost sets stage=lost + lostReason and logs a stage_change activity", async () => {
    const inq = await makeInquiry();
    await inquiriesService.markLost(inq.publicId, "price", "Too expensive for them");
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.stage).toBe("lost");
    expect(row.lostReason).toBe("price");
    const [act] = await db
      .select()
      .from(inquiryActivities)
      .where(eq(inquiryActivities.type, "stage_change"))
      .limit(1);
    expect(act.fromStage).toBe("new");
    expect(act.toStage).toBe("lost");
    expect(act.note).toBe("Too expensive for them");
  });

  it("markLost on an already-converted inquiry throws ValidationError", async () => {
    const inq = await makeInquiry();
    await inquiriesService.update(inq.publicId, { stage: "converted" });
    await expect(inquiriesService.markLost(inq.publicId, "other")).rejects.toThrow(ValidationError);
  });
});
