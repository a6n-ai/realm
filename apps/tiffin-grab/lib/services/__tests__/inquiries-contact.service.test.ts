import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureSystemUser } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadCounters } from "@/db/schema";
import { ValidationError } from "@foundry/commons";
import { isQuickAdd } from "@/lib/inquiries/quick-add";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(leadCounters);
}

const quick = (phone: string) => inquiriesService.create({ phone, sourceKey: "facebook" });

describe("inquiriesService.updateContact", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("rename drops lead out of quick adds", async () => {
    const q = await quick("+16475555001");
    const r = await inquiriesService.updateContact(q.publicId, { fullName: "Priya S." });
    expect(r.fullName).toBe("Priya S.");
    expect(isQuickAdd(r)).toBe(false);
    expect(await inquiriesService.nextQuickAdd(undefined)).toBeNull();
  });

  it("blank name keeps generated name", async () => {
    const q = await quick("+16475555002");
    const r = await inquiriesService.updateContact(q.publicId, { fullName: "" });
    expect(r.fullName).toBe(q.fullName);
    expect(r.leadNumber).toBe(q.leadNumber);
  });

  it("clearing name on a named lead with phone generates one", async () => {
    const n = await inquiriesService.create({ fullName: "Named", phone: "+16475555003", sourceKey: "facebook" });
    const r = await inquiriesService.updateContact(n.publicId, { fullName: null });
    expect(r.fullName).toMatch(/^Lead \d+$/);
    expect(r.leadNumber).not.toBeNull();
  });

  it("clearing name and phone rejected", async () => {
    const n = await inquiriesService.create({ fullName: "Named", phone: "+16475555004", sourceKey: "facebook" });
    await expect(inquiriesService.updateContact(n.publicId, { fullName: "", phone: "" })).rejects.toThrow("Enter a name or phone number");
  });

  it("phone collision rejected", async () => {
    const other = await quick("+16475555005");
    const me = await quick("+16475555006");
    await expect(inquiriesService.updateContact(me.publicId, { phone: "+16475555005" })).rejects.toThrow(other.publicId);
  });

  it("whatsapp collision rejected", async () => {
    const other = await quick("+16475555007");
    const me = await quick("+16475555008");
    await expect(inquiriesService.updateContact(me.publicId, { whatsappPhone: "+16475555007" })).rejects.toThrow(other.publicId);
  });

  it("stores whatsapp and email", async () => {
    const me = await quick("+16475555009");
    const r = await inquiriesService.updateContact(me.publicId, { whatsappPhone: "+16475555010", email: "P@Test.invalid" });
    expect(r.whatsappPhone).toBe("+16475555010");
    expect(r.email).toBe("p@test.invalid");
  });

  it("converted lead rejected", async () => {
    const me = await quick("+16475555011");
    await db.update(inquiries).set({ stage: "converted" }).where(eq(inquiries.id, me.id));
    await expect(inquiriesService.updateContact(me.publicId, { fullName: "X" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("change logs a note activity", async () => {
    const q = await quick("+16475555012");
    await inquiriesService.updateContact(q.publicId, { fullName: "Priya S." });
    const acts = await inquiriesService.listActivities(q.publicId);
    const note = acts.find((a) => a.type === "note");
    expect(note?.note).toContain(`Name changed from ${q.fullName} to Priya S.`);
  });

  it("lost lead with a newer open lead for the same person can still be renamed", async () => {
    const old = await quick("+16475555101");
    await db.update(inquiries).set({ stage: "lost" }).where(eq(inquiries.id, old.id));
    await quick("+16475555101");
    const r = await inquiriesService.updateContact(old.publicId, { fullName: "Old Lead Real Name" });
    expect(r.fullName).toBe("Old Lead Real Name");
  });
});
