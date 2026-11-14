import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSystemUser } from "@/db/test-helpers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";
import { NotFoundError, ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { inquiriesService } = await import("../inquiries.service");

function testEmail() {
  return `inq-${Math.random().toString(36).slice(2)}@test.invalid`;
}

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}
const base = { fullName: "Resolver", email: testEmail() as string | undefined };

describe("inquiriesService.resolveForSource", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("reuses an open inquiry with the same phone + source", async () => {
    const phone = "+16475554000";
    const existing = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook", email: testEmail() });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "facebook", contact: base, visible: "all" });
    expect(id).toBe(existing.publicId);
    expect(await inquiriesService.findOpenByPhone(phone)).toHaveLength(1); // no duplicate
  });

  it("folds a different source into the person's open inquiry as a re-inquiry", async () => {
    const phone = "+16475554001";
    const fb = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook", email: testEmail() });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "manual", contact: base, visible: "all" });
    expect(id).toBe(fb.publicId);
    expect(await inquiriesService.findOpenByPhone(phone)).toHaveLength(1);
    const acts = await inquiriesService.listActivities(fb.publicId);
    expect(acts.find((a) => a.type === "reinquiry")?.note).toMatch(/^Re-inquiry via /);
  });

  it("creates a new inquiry when none exists for the phone", async () => {
    const id = await inquiriesService.resolveForSource({ phone: "+16475554002", sourceKey: "manual", contact: base, visible: "all" });
    expect(id).toMatch(/^inq_/);
  });

  it("honors pickedId", async () => {
    const phone = "+16475554003";
    const picked = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook", email: testEmail() });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "manual", contact: base, pickedId: picked.publicId, visible: "all" });
    expect(id).toBe(picked.publicId);
  });

  it("rejects reusing a converted inquiry via pickedId", async () => {
    const phone = "+16475554004";
    const picked = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook", email: testEmail() });
    await inquiriesService.update(picked.publicId, { stage: "converted" });
    await expect(
      inquiriesService.resolveForSource({ phone, sourceKey: "facebook", contact: base, pickedId: picked.publicId, visible: "all" }),
    ).rejects.toThrow(ValidationError);
  });

  it("treats a picked inquiry outside the caller's orgs as not found", async () => {
    const phone = "+16475554005";
    const picked = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook", email: testEmail() });
    await expect(
      inquiriesService.resolveForSource({ phone, sourceKey: "manual", contact: base, pickedId: picked.publicId, visible: ["org_other"] }),
    ).rejects.toThrow(NotFoundError);
  });
});

// One open lead per person (phone or email) for ALL callers — the add-inquiry
// form, the public contact form, imports — enforced by partial unique indexes.
describe("inquiriesService.createOrFold — one open lead per person", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("same phone: folds, logs a re-inquiry, no second created activity", async () => {
    const phone = "+16475554100";
    const first = await inquiriesService.create({ fullName: "Dup", phone, sourceKey: "facebook", email: testEmail() });
    const second = await inquiriesService.createOrFold({ fullName: "Dup Again", phone, sourceKey: "manual", email: testEmail(), notes: "Wants Sunday lunch" });
    expect(second.folded).toBe(true);
    expect(second.inquiry.publicId).toBe(first.publicId);
    const acts = await inquiriesService.listActivities(first.publicId);
    expect(acts.filter((a) => a.type === "created")).toHaveLength(1);
    const re = acts.find((a) => a.type === "reinquiry");
    expect(re?.note).toContain("email ");
    expect(re?.note).toContain("Wants Sunday lunch");
  });

  it("same email, different phone: folds into that inquiry", async () => {
    const email = testEmail();
    const first = await inquiriesService.create({ fullName: "E", phone: "+16475554110", sourceKey: "facebook", email });
    const second = await inquiriesService.createOrFold({ fullName: "E", phone: "+16475554111", sourceKey: "facebook", email: email.toUpperCase() });
    expect(second.inquiry.publicId).toBe(first.publicId);
    expect((await inquiriesService.listActivities(first.publicId)).find((a) => a.type === "reinquiry")?.note).toContain("phone +16475554111");
  });

  it("email wins when phone and email match different inquiries", async () => {
    const email = testEmail();
    await inquiriesService.create({ fullName: "ByPhone", phone: "+16475554120", sourceKey: "facebook", email: testEmail() });
    const byEmail = await inquiriesService.create({ fullName: "ByEmail", phone: "+16475554121", sourceKey: "facebook", email });
    const out = await inquiriesService.createOrFold({ fullName: "X", phone: "+16475554120", sourceKey: "manual", email });
    expect(out.inquiry.publicId).toBe(byEmail.publicId);
  });

  it("a lost lead is reopened by a new inquiry from the same person", async () => {
    const phone = "+16475554130";
    const first = await inquiriesService.create({ fullName: "L", phone, sourceKey: "facebook", email: testEmail() });
    await inquiriesService.markLost(first.publicId, "other");
    const out = await inquiriesService.createOrFold({ fullName: "L", phone, sourceKey: "facebook", email: testEmail() });
    expect(out.outcome).toBe("reopened");
    expect(out.inquiry.publicId).toBe(first.publicId);
  });

  it("a picked inquiry whose typed contact belongs to another row is refused", async () => {
    const other = await inquiriesService.create({ fullName: "Other", phone: "+16475554140", sourceKey: "facebook", email: testEmail() });
    const picked = await inquiriesService.create({ fullName: "Picked", phone: "+16475554141", sourceKey: "facebook", email: testEmail() });
    await expect(
      inquiriesService.resolveForSource({ phone: "+16475554140", sourceKey: "manual", contact: { fullName: "Picked" }, pickedId: picked.publicId, visible: "all" }),
    ).rejects.toThrow(`contact belongs to ${other.publicId}`);
  });

  it("forOrder accepts a picked converted inquiry; without it the pick is refused", async () => {
    const conv = await inquiriesService.create({ fullName: "Conv", phone: "+16475554142", sourceKey: "facebook", email: testEmail() });
    await db.update(inquiries).set({ stage: "converted", subStatus: "took_plan" }).where(eq(inquiries.id, conv.id));
    const input = { phone: "+16475554142", sourceKey: "manual", contact: { fullName: "Conv" }, pickedId: conv.publicId, visible: "all" as const };
    await expect(inquiriesService.resolveForSource(input)).rejects.toThrow("That inquiry is already converted");
    expect(await inquiriesService.resolveForSource({ ...input, forOrder: true })).toBe(conv.publicId);
  });

  it("email wins over an older phone match at the same stage", async () => {
    const email = testEmail();
    const byEmail = await inquiriesService.create({ fullName: "ByEmail", phone: "+16475554131", sourceKey: "facebook", email });
    await inquiriesService.create({ fullName: "ByPhone", phone: "+16475554132", sourceKey: "facebook", email: testEmail() });
    const out = await inquiriesService.createOrFold({ fullName: "X", phone: "+16475554132", sourceKey: "manual", email });
    expect(out.inquiry.publicId).toBe(byEmail.publicId);
  });
});
