import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { ensureSystemUser, deleteNonSystemUsers } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, notificationOutbox, orders } from "@/db/schema";
import { insertTestInquiry, insertTestOrder, insertTestUser, resetInquiryData, testEmail } from "./helpers/inquiry-fixtures";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await resetInquiryData();
  await db.delete(orders);
  await deleteNonSystemUsers();
}

const acts = (inquiryId: bigint) => db.select().from(inquiryActivities).where(eq(inquiryActivities.inquiryId, inquiryId)).orderBy(inquiryActivities.createdAt);
const row = async (id: bigint) => (await db.select().from(inquiries).where(eq(inquiries.id, id)))[0];

describe("createOrFold match branches", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("folds into an open row, returns outcome folded, and fills postal code", async () => {
    const open = await insertTestInquiry({ phone: "+16475551201" });
    const r = await inquiriesService.createOrFold({ phone: "+16475551201", postalCode: "M5V 2T6", sourceKey: "website" });
    expect(r.outcome).toBe("folded");
    expect(r.folded).toBe(true);
    expect(r.inquiry.id).toBe(open.id);
    expect((await row(open.id)).postalCode).toBe("M5V 2T6");
    expect((await acts(open.id)).map((a) => a.type)).toEqual(["reinquiry"]);
  });

  it("folds a converted row without reopening it", async () => {
    const conv = await insertTestInquiry({ phone: "+16475551202", stage: "converted", subStatus: "took_plan" });
    const r = await inquiriesService.createOrFold({ phone: "+16475551202", sourceKey: "website" });
    expect(r.outcome).toBe("folded");
    const after = await row(conv.id);
    expect(after.stage).toBe("converted");
    expect(after.subStatus).toBe("took_plan");
  });

  it("reopens a lost row with no live plan", async () => {
    const lost = await insertTestInquiry({ phone: "+16475551203", stage: "lost", subStatus: "lost", lostReason: "price", nextFollowUpAt: 5 });
    const r = await inquiriesService.createOrFold({ phone: "+16475551203", sourceKey: "website" });
    expect(r.outcome).toBe("reopened");
    expect(r.folded).toBe(true);
    const after = await row(lost.id);
    expect(after).toMatchObject({ stage: "new", subStatus: null, lostReason: null, nextFollowUpAt: null });
    const a = await acts(lost.id);
    expect(a.map((x) => x.type)).toEqual(["stage_change", "reinquiry"]);
    expect(a[0]).toMatchObject({ fromStage: "lost", toStage: "new" });
    expect(a[1].details).toMatchObject({ reopened: true });
  });

  it("does not reopen a lost row whose customer has an active order", async () => {
    const u = await insertTestUser();
    await insertTestOrder(u.id, { status: "active" });
    const lost = await insertTestInquiry({ phone: "+16475551204", stage: "lost", subStatus: "lost", customerId: u.id });
    const r = await inquiriesService.createOrFold({ phone: "+16475551204", sourceKey: "website" });
    expect(r.outcome).toBe("folded");
    expect((await row(lost.id)).stage).toBe("lost");
  });

  it("writes match_conflict instead of filling an identifier another row holds", async () => {
    const email = testEmail();
    const byEmail = await insertTestInquiry({ email, fullName: "By email" });
    const byPhone = await insertTestInquiry({ phone: "+16475551205" });
    const r = await inquiriesService.createOrFold({ phone: "+16475551205", email, sourceKey: "website" });
    // Email is the login identity, so the email row wins; the phone stays on its own row.
    expect(r.inquiry.id).toBe(byEmail.id);
    const conflicts = (await acts(byEmail.id)).filter((a) => a.type === "match_conflict");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].details).toMatchObject({ conflictWith: byPhone.publicId, skipped: ["phone"] });
    expect((await row(byEmail.id)).phone).toBeNull();
  });

  it("marks a new lead's created activity with origin lead", async () => {
    const r = await inquiriesService.createOrFold({ phone: "+16475551206", fullName: "Fresh", sourceKey: "website" });
    expect(r.outcome).toBe("created");
    const [created] = await acts(r.inquiry.id);
    expect(created.type).toBe("created");
    expect(created.details).toMatchObject({ origin: "lead", source: "website" });
  });

  it("notifies the owner on a fold with a per-activity dedupe key", async () => {
    const open = await insertTestInquiry({ phone: "+16475551207" });
    await inquiriesService.createOrFold({ phone: "+16475551207", sourceKey: "website" });
    const notes = await db.select().from(notificationOutbox).where(like(notificationOutbox.dedupeKey, `inquiry_reinquiry:${open.publicId}:%`));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.event === "inquiry_reinquiry")).toBe(true);
    const [reinq] = (await acts(open.id)).filter((a) => a.type === "reinquiry");
    expect(notes[0].dedupeKey!.startsWith(`inquiry_reinquiry:${open.publicId}:${reinq.publicId}`)).toBe(true);
  });

  it("stores details on the reinquiry activity, never on the row", async () => {
    const open = await insertTestInquiry({ phone: "+16475551208" });
    await inquiriesService.createOrFold({ phone: "+16475551208", sourceKey: "website", details: { source: "waitlist" } });
    const [reinq] = (await acts(open.id)).filter((a) => a.type === "reinquiry");
    expect(reinq.details).toMatchObject({ source: "waitlist" });
    const reinqCount = await db.select().from(inquiryActivities).where(and(eq(inquiryActivities.inquiryId, open.id), eq(inquiryActivities.type, "reinquiry")));
    expect(reinqCount).toHaveLength(1);
  });

  it("review: does not reopen a lost row whose other identifier an open row holds", async () => {
    const email = testEmail();
    const open = await insertTestInquiry({ email, fullName: "Open twin" });
    const lost = await insertTestInquiry({ phone: "+16475551209", email, stage: "lost", subStatus: "lost" });
    const r = await inquiriesService.createOrFold({ phone: "+16475551209", sourceKey: "website" });
    expect(r.outcome).toBe("folded");
    expect((await row(lost.id)).stage).toBe("lost");
    const conflicts = (await acts(lost.id)).filter((a) => a.type === "match_conflict");
    expect(conflicts[0]?.details).toMatchObject({ conflictWith: open.publicId });
  });
});

