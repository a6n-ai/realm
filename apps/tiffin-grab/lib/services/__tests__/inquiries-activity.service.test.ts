import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSystemUser } from "@/db/test-helpers";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, users } from "@/db/schema";
import { ValidationError } from "@foundry/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  session.user = null;
}

async function makeInquiry() {
  return inquiriesService.create({
    fullName: "Lead A",
    phone: "+16475553000",
    sourceKey: "manual",
    email: `inq-${Math.random().toString(36).slice(2)}@test.invalid`,
  });
}

describe("inquiriesService.logActivity + markLost", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
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

  it("persists amount on quote_sent without changing stage", async () => {
    const inq = await makeInquiry();
    await inquiriesService.logActivity(inq.publicId, {
      type: "quote_sent",
      amount: 450000,
      note: "quoted veg weekly",
    });
    const after = await inquiriesService.read(inq.publicId);
    expect(after.stage).toBe("new");
    const acts = await inquiriesService.listActivities(inq.publicId);
    const quote = acts.find((a) => a.type === "quote_sent");
    expect(quote?.amount).toBe(450000);
  });

  it("does not advance stage for a plain call", async () => {
    const inq = await makeInquiry();
    await inquiriesService.logActivity(inq.publicId, { type: "call", outcome: "no answer" });
    expect((await inquiriesService.read(inq.publicId)).stage).toBe("new");
  });

  it("clearFollowUp clears the follow-up and logs a Follow-up done activity", async () => {
    const inq = await makeInquiry();
    await inquiriesService.logActivity(inq.publicId, { type: "call", nextFollowUpAt: Date.now() + 86_400_000 });
    await inquiriesService.clearFollowUp(inq.publicId);
    expect((await inquiriesService.read(inq.publicId)).nextFollowUpAt).toBeNull();
    const acts = await inquiriesService.listActivities(inq.publicId);
    expect(acts.find((a) => a.type === "callback")).toMatchObject({ note: "Follow-up done" });
  });

  it("clearFollowUp rejects when nothing is scheduled or the inquiry is converted", async () => {
    const inq = await makeInquiry();
    await expect(inquiriesService.clearFollowUp(inq.publicId)).rejects.toThrow(ValidationError);
    await inquiriesService.logActivity(inq.publicId, { type: "call", nextFollowUpAt: Date.now() + 86_400_000 });
    await inquiriesService.update(inq.publicId, { stage: "converted" });
    await expect(inquiriesService.clearFollowUp(inq.publicId)).rejects.toThrow(ValidationError);
  });
});

describe("inquiriesService.queuePosition", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("ranks overdue leads longest-overdue first, 1-based", async () => {
    const dayStart = Date.now();
    const dayEnd = dayStart + 86_400_000;
    const day = 86_400_000;
    const make = (phone: string) => inquiriesService.create({ fullName: "Lead", phone, sourceKey: "manual", email: `${phone}@test.invalid` });
    const a = await make("+16475553101");
    const b = await make("+16475553102");
    const c = await make("+16475553103");
    await inquiriesService.update(a.publicId, { nextFollowUpAt: dayStart - day });
    await inquiriesService.update(b.publicId, { nextFollowUpAt: dayStart - 3 * day });
    await inquiriesService.update(c.publicId, { nextFollowUpAt: dayStart - 2 * day });
    expect(await inquiriesService.queuePosition(undefined, dayStart, dayEnd, b.publicId)).toBe(1);
    expect(await inquiriesService.queuePosition(undefined, dayStart, dayEnd, c.publicId)).toBe(2);
    expect(await inquiriesService.queuePosition(undefined, dayStart, dayEnd, a.publicId)).toBe(3);
  });
});
