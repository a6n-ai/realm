import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSystemUser } from "@/db/test-helpers";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
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
    it("whatsapp-only lead uses the whatsapp number as its phone", async () => {
      const a = await inquiriesService.create({ whatsappPhone: "+16475552401", sourceKey: "facebook" });
      expect(a.phone).toBe("+16475552401");
      expect(a.fullName).toBe(`Lead ${a.leadNumber}`);
      const r = await inquiriesService.createOrFold({ phone: "+16475552401", sourceKey: "facebook" });
      expect(r.folded).toBe(true);
    });

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

  describe("quick adds queue", () => {
    const D = 0;
    const listQuick = async () =>
      (await inquiriesService.listForPipeline(undefined, { page: 0, size: 50 }, { column: "created", dir: "asc" }, { tab: "quick", dayStart: D, dayEnd: D + 1 })).items.map((r) => r.publicId);

    it("lists only untouched quick adds, oldest first", async () => {
      const a = await inquiriesService.create({ phone: "+16475554001", sourceKey: "facebook" });
      const b = await inquiriesService.create({ phone: "+16475554002", sourceKey: "facebook" });
      const c = await inquiriesService.create({ phone: "+16475554003", sourceKey: "facebook" });
      await inquiriesService.create({ fullName: "Named", phone: "+16475554004", sourceKey: "facebook" });
      await db.update(inquiries).set({ fullName: "Real Name" }).where(eq(inquiries.id, b.id));
      expect(await listQuick()).toEqual([a.publicId, c.publicId]);
    });

    it("nextLead recommends overdue, then due today, then quick adds, then other open leads", async () => {
      const DAY = 864e5;
      const dayStart = Date.now() - DAY / 2;
      const dayEnd = dayStart + DAY;
      const mk = async (phone: string, next: number | null, fullName?: string) => {
        const r = await inquiriesService.create({ phone, sourceKey: "facebook", ...(fullName ? { fullName } : {}) });
        await db.update(inquiries).set({ nextFollowUpAt: next }).where(eq(inquiries.id, r.id));
        return r;
      };
      const open = await mk("+16475554101", null, "Named Open");
      const quick = await mk("+16475554102", null);
      const today = await mk("+16475554103", dayStart + 1000);
      const overdue = await mk("+16475554104", dayStart - 1000);
      await mk("+16475554105", dayEnd + 1000); // follow-up after today: not recommended yet
      const ids = [overdue, today, quick, open].map((r) => ({ publicId: r.publicId }));

      expect(await inquiriesService.nextLead(undefined, dayStart, dayEnd)).toEqual(ids[0]);
      // Next walks the order and wraps; Previous walks it back.
      for (let i = 0; i < 4; i++) {
        const cur = [overdue, today, quick, open][i];
        expect(await inquiriesService.nextLead(undefined, dayStart, dayEnd, { publicId: cur.publicId, dir: "next" })).toEqual(ids[(i + 1) % 4]);
        expect(await inquiriesService.nextLead(undefined, dayStart, dayEnd, { publicId: cur.publicId, dir: "prev" })).toEqual(ids[(i + 3) % 4]);
      }
      // Working a lead (follow-up moved past today) drops it out: Next restarts at the top.
      await db.update(inquiries).set({ nextFollowUpAt: dayEnd + DAY }).where(eq(inquiries.id, today.id));
      expect(await inquiriesService.nextLead(undefined, dayStart, dayEnd, { publicId: today.publicId, dir: "next" })).toEqual(ids[0]);
    });

    it("upNext wraps past the end of the queue and never repeats the current lead", async () => {
      const DAY = 864e5;
      const dayStart = Date.now() - DAY / 2;
      const dayEnd = dayStart + DAY;
      const mk = async (phone: string, next: number | null, fullName?: string) => {
        const r = await inquiriesService.create({ phone, sourceKey: "facebook", ...(fullName ? { fullName } : {}) });
        await db.update(inquiries).set({ nextFollowUpAt: next }).where(eq(inquiries.id, r.id));
        return r;
      };
      const open = await mk("+16475554501", null, "Named Open");
      const quick = await mk("+16475554502", null);
      const today = await mk("+16475554503", dayStart + 1000);
      const overdue = await mk("+16475554504", dayStart - 1000);
      const order = [overdue, today, quick, open].map((r) => r.publicId);

      expect(await inquiriesService.recommendedLeads(undefined, dayStart, dayEnd, 2)).toEqual({ publicIds: [order[0], order[1]], total: 4 });
      expect(await inquiriesService.recommendedLeads(undefined, dayStart, dayEnd, 6)).toEqual({ publicIds: order, total: 4 });
    });

    it("nextLead returns null when nothing is due", async () => {
      const r = await inquiriesService.create({ fullName: "Later", phone: "+16475554201", sourceKey: "facebook" });
      await db.update(inquiries).set({ nextFollowUpAt: Date.now() + 10 * 864e5 }).where(eq(inquiries.id, r.id));
      expect(await inquiriesService.nextLead(undefined, Date.now() - 1000, Date.now() + 1000)).toBeNull();
    });

    it("queueCounts includes quick", async () => {
      await inquiriesService.create({ phone: "+16475554301", sourceKey: "facebook" });
      expect((await inquiriesService.queueCounts(undefined, D, D + 1)).quick).toBe(1);
    });
  });
});
