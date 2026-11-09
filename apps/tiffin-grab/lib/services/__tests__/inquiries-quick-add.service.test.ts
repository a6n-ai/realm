import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSystemUser } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadCounters } from "@/db/schema";
import { ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(leadCounters);
}

describe("quick-add leads", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  describe("generated names", () => {
    it("nameless create gets Lead <n> and increments", async () => {
      const a = await inquiriesService.create({ phone: "+16475552001", sourceKey: "facebook" });
      const b = await inquiriesService.create({ phone: "+16475552002", sourceKey: "facebook" });
      expect(a.fullName).toBe(`Lead ${a.leadNumber}`);
      expect(b.leadNumber).toBe(a.leadNumber! + 1);
    });

    it("named create uses no number", async () => {
      const a = await inquiriesService.create({ fullName: "Priya", phone: "+16475552003", sourceKey: "facebook" });
      expect(a.leadNumber).toBeNull();
    });

    it("folded repeat consumes no number", async () => {
      const a = await inquiriesService.create({ phone: "+16475552004", sourceKey: "facebook" });
      const r = await inquiriesService.createOrFold({ phone: "+16475552004", sourceKey: "facebook" });
      expect(r.folded).toBe(true);
      const c = await inquiriesService.create({ phone: "+16475552005", sourceKey: "facebook" });
      expect(c.leadNumber).toBe(a.leadNumber! + 1);
    });

    it("concurrent nameless creates get distinct numbers", async () => {
      const rows = await Promise.all(Array.from({ length: 10 }, (_, i) =>
        inquiriesService.create({ phone: `+1647555210${i}`, sourceKey: "facebook" })));
      expect(new Set(rows.map((r) => r.leadNumber)).size).toBe(10);
    });

    it("email-only create is still rejected", async () => {
      await expect(inquiriesService.create({ email: "x@test.invalid", sourceKey: "facebook" })).rejects.toThrow(ValidationError);
    });
  });

  describe("whatsapp dedup", () => {
    it("phone matching an open lead's whatsapp folds", async () => {
      const a = await inquiriesService.create({ fullName: "A", phone: "+16475552201", whatsappPhone: "+16475552202", sourceKey: "facebook" });
      expect(a.whatsappPhone).toBe("+16475552202");
      const r = await inquiriesService.createOrFold({ phone: "+16475552202", sourceKey: "facebook" });
      expect(r.folded).toBe(true);
    });

    it("whatsapp matching an open lead's phone folds", async () => {
      await inquiriesService.create({ fullName: "B", phone: "+16475552301", sourceKey: "facebook" });
      const r = await inquiriesService.createOrFold({ fullName: "B2", phone: "+16475552399", whatsappPhone: "+16475552301", sourceKey: "facebook" });
      expect(r.folded).toBe(true);
    });
  });
});
