import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";
import { ValidationError } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}
const base = { fullName: "Resolver", email: undefined as string | undefined };

describe("inquiriesService.resolveForSource", () => {
  beforeEach(reset);
  afterAll(reset);

  it("reuses an open inquiry with the same phone + source", async () => {
    const phone = "+16475554000";
    const existing = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook" });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "facebook", contact: base });
    expect(id).toBe(existing.publicId);
    expect(await inquiriesService.findOpenByPhone(phone)).toHaveLength(1); // no duplicate
  });

  it("creates a new inquiry when the source differs", async () => {
    const phone = "+16475554001";
    const fb = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook" });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "manual", contact: base });
    expect(id).not.toBe(fb.publicId);
    expect(await inquiriesService.findOpenByPhone(phone)).toHaveLength(2);
  });

  it("creates a new inquiry when none exists for the phone", async () => {
    const id = await inquiriesService.resolveForSource({ phone: "+16475554002", sourceKey: "manual", contact: base });
    expect(id).toMatch(/^inq_/);
  });

  it("honors pickedId", async () => {
    const phone = "+16475554003";
    const picked = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook" });
    const id = await inquiriesService.resolveForSource({ phone, sourceKey: "manual", contact: base, pickedId: picked.publicId });
    expect(id).toBe(picked.publicId);
  });

  it("rejects reusing a converted inquiry via pickedId", async () => {
    const phone = "+16475554004";
    const picked = await inquiriesService.create({ fullName: "R", phone, sourceKey: "facebook" });
    await inquiriesService.changeStage(picked.publicId, "converted");
    await expect(
      inquiriesService.resolveForSource({ phone, sourceKey: "facebook", contact: base, pickedId: picked.publicId }),
    ).rejects.toThrow(ValidationError);
  });
});
