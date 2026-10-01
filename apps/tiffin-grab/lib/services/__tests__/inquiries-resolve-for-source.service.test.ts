import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSystemUser } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";
import { ValidationError } from "@foundry/commons";

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
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "facebook", contact: base });
    expect(id).toBe(existing.publicId);
    expect(await inquiriesService.findOpenByPhone(phone)).toHaveLength(1); // no duplicate
  });

  it("folds a different source into the person's open inquiry as a re-inquiry", async () => {
    const phone = "+16475554001";
    const fb = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook", email: testEmail() });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "manual", contact: base });
    expect(id).toBe(fb.publicId);
    expect(await inquiriesService.findOpenByPhone(phone)).toHaveLength(1);
    const acts = await inquiriesService.listActivities(fb.publicId);
    expect(acts.find((a) => a.type === "reinquiry")?.note).toMatch(/^Re-inquiry via /);
  });

  it("creates a new inquiry when none exists for the phone", async () => {
    const id = await inquiriesService.resolveForSource({ phone: "+16475554002", sourceKey: "manual", contact: base });
    expect(id).toMatch(/^inq_/);
  });

  it("honors pickedId", async () => {
    const phone = "+16475554003";
    const picked = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook", email: testEmail() });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "manual", contact: base, pickedId: picked.publicId });
    expect(id).toBe(picked.publicId);
  });

  it("rejects reusing a converted inquiry via pickedId", async () => {
    const phone = "+16475554004";
    const picked = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook", email: testEmail() });
    await inquiriesService.changeStage(picked.publicId, "converted");
    await expect(
      inquiriesService.resolveForSource({ phone, sourceKey: "facebook", contact: base, pickedId: picked.publicId }),
    ).rejects.toThrow(ValidationError);
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

  it("a lost lead does not absorb a new inquiry", async () => {
    const phone = "+16475554130";
    const first = await inquiriesService.create({ fullName: "L", phone, sourceKey: "facebook", email: testEmail() });
    await inquiriesService.markLost(first.publicId, "other");
    const out = await inquiriesService.createOrFold({ fullName: "L", phone, sourceKey: "facebook", email: testEmail() });
    expect(out.folded).toBe(false);
    expect(out.inquiry.publicId).not.toBe(first.publicId);
  });
});
