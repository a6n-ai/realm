import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSystemUser } from "@/db/test-helpers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";
import { ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { inquiriesService } = await import("../inquiries.service");

const email = () => `inq-${Math.random().toString(36).slice(2)}@test.invalid`;
let n = 0;
const phone = () => `+1647556${String(1000 + n++)}`;

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}
const row = async (id: bigint) => (await db.select().from(inquiries).where(eq(inquiries.id, id)))[0];
const acts = async (id: bigint) => db.select().from(inquiryActivities).where(eq(inquiryActivities.inquiryId, id));
const mk = (extra: Record<string, unknown> = {}) =>
  inquiriesService.create({ fullName: "L", phone: phone(), sourceKey: "manual", email: email(), ...extra });

describe("inquiriesService.create name-or-phone", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("accepts phone only or name only, rejects neither", async () => {
    expect((await inquiriesService.create({ phone: phone(), sourceKey: "manual" })).fullName).toBeNull();
    expect((await inquiriesService.create({ fullName: "Only Name", sourceKey: "manual" })).phone).toBeNull();
    await expect(inquiriesService.create({ sourceKey: "manual" })).rejects.toThrow("Enter a name or phone number");
    await expect(inquiriesService.create({ sourceKey: "manual" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("stores null email and null for a blank name", async () => {
    const inq = await inquiriesService.create({ fullName: "  ", phone: phone(), sourceKey: "manual" });
    expect(inq.email).toBeNull();
    expect(inq.fullName).toBeNull();
  });

  it("does not fold name-only leads; folds same phone without email; not different phones", async () => {
    await inquiriesService.create({ fullName: "Same", sourceKey: "manual" });
    await inquiriesService.create({ fullName: "Same", sourceKey: "manual" });
    expect(await db.select().from(inquiries)).toHaveLength(2);

    const p = phone();
    const a = await inquiriesService.createOrFold({ phone: p, sourceKey: "manual", email: email() });
    const b = await inquiriesService.createOrFold({ phone: p, sourceKey: "manual" });
    expect(b.folded).toBe(true);
    expect(b.inquiry.id).toBe(a.inquiry.id);
    const c = await inquiriesService.createOrFold({ phone: phone(), sourceKey: "manual" });
    expect(c.folded).toBe(false);
  });
});

describe("inquiriesService.setStatus", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("sets sub-status, derived stage and one activity", async () => {
    const inq = await mk();
    const res = await inquiriesService.setStatus(inq.publicId, { subStatus: "responded" });
    expect(res.previous).toBeNull();
    const r = await row(inq.id);
    expect(r.subStatus).toBe("responded");
    expect(r.stage).toBe("contacted");
    const change = (await acts(inq.id)).filter((a) => a.type === "stage_change");
    expect(change).toHaveLength(1);
    expect(change[0].fromSubStatus).toBeNull();
    expect(change[0].toSubStatus).toBe("responded");
  });

  it("stores follow-up date on row and activity, and the note", async () => {
    const inq = await mk();
    const t = Date.now() + 5 * 86_400_000;
    await inquiriesService.setStatus(inq.publicId, { subStatus: "future", nextFollowUpAt: t, note: "after Diwali" });
    expect((await row(inq.id)).nextFollowUpAt).toBe(t);
    const a = (await acts(inq.id)).find((x) => x.type === "stage_change")!;
    expect(a.nextFollowUpAt).toBe(t);
    expect(a.note).toBe("after Diwali");
  });

  it("lost needs a reason and clears the follow-up", async () => {
    const inq = await mk();
    await inquiriesService.setStatus(inq.publicId, { subStatus: "future", nextFollowUpAt: Date.now() + 1000 });
    await expect(inquiriesService.setStatus(inq.publicId, { subStatus: "lost" })).rejects.toThrow(ValidationError);
    await inquiriesService.setStatus(inq.publicId, { subStatus: "lost", lostReason: "asked_to_stop" });
    const r = await row(inq.id);
    expect(r.stage).toBe("lost");
    expect(r.lostReason).toBe("asked_to_stop");
    expect(r.nextFollowUpAt).toBeNull();
  });

  it("undeliverable is lost with out_of_zone", async () => {
    const inq = await mk();
    await inquiriesService.setStatus(inq.publicId, { subStatus: "undeliverable" });
    const r = await row(inq.id);
    expect(r.stage).toBe("lost");
    expect(r.lostReason).toBe("out_of_zone");
  });

  it("same status twice logs once", async () => {
    const inq = await mk();
    await inquiriesService.setStatus(inq.publicId, { subStatus: "responded" });
    await inquiriesService.setStatus(inq.publicId, { subStatus: "responded" });
    expect((await acts(inq.id)).filter((a) => a.type === "stage_change")).toHaveLength(1);
  });

  it("logActivity with nextFollowUpAt updates the column", async () => {
    const inq = await mk();
    const t = Date.now() + 86_400_000;
    await inquiriesService.logActivity(inq.publicId, { type: "call", nextFollowUpAt: t });
    expect((await row(inq.id)).nextFollowUpAt).toBe(t);
  });

  it("changeStage wrapper maps legacy stages", async () => {
    const inq = await mk();
    await inquiriesService.changeStage(inq.publicId, "quoted");
    expect((await row(inq.id)).subStatus).toBe("expected");
    await expect(inquiriesService.changeStage(inq.publicId, "converted")).rejects.toThrow(ValidationError);
  });
});

describe("inquiriesService queue tabs", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  const D = Date.UTC(2026, 10, 2);
  const H = 3_600_000;
  const page = { page: 0, size: 50 };

  async function seed() {
    const ids: Record<string, string> = {};
    const mkAt = async (name: string, next: number | null, close = false) => {
      const inq = await mk({ fullName: name });
      await db.update(inquiries).set({ nextFollowUpAt: next }).where(eq(inquiries.id, inq.id));
      if (close) await inquiriesService.setStatus(inq.publicId, { subStatus: "lost", lostReason: "other" });
      ids[inq.publicId] = name;
      return inq;
    };
    await mkAt("A", null);
    await mkAt("B", D + H);
    await mkAt("C", D - H);
    await mkAt("E", D + 2 * 86_400_000);
    await mkAt("F", null, true);
    return ids;
  }
  const names = async (tab: "due" | "overdue" | "upcoming" | "open" | "closed", dayEnd = D + 86_400_000) =>
    (await inquiriesService.listForPipeline(undefined, page, undefined, { tab, dayStart: D, dayEnd })).items
      .map((i) => i.fullName).sort();

  it("splits leads into tabs and counts match", async () => {
    await seed();
    expect(await names("due")).toEqual(["A", "B"]);
    expect(await names("overdue")).toEqual(["C"]);
    expect(await names("upcoming")).toEqual(["E"]);
    expect(await names("open")).toEqual(["A", "B", "C", "E"]);
    expect(await names("closed")).toEqual(["F"]);
    expect(await inquiriesService.queueCounts(undefined, D, D + 86_400_000)).toEqual({ due: 2, overdue: 1, upcoming: 1, open: 4, closed: 1 });
  });

  it("dayEnd boundary is exclusive for due", async () => {
    const inq = await mk({ fullName: "Edge" });
    await db.update(inquiries).set({ nextFollowUpAt: D + 86_400_000 - 1 }).where(eq(inquiries.id, inq.id));
    expect(await names("due")).toEqual(["Edge"]);
    await db.update(inquiries).set({ nextFollowUpAt: D + 86_400_000 }).where(eq(inquiries.id, inq.id));
    expect(await names("upcoming")).toEqual(["Edge"]);
  });

  it("groupCounts buckets by sub-status", async () => {
    const a = await mk();
    await mk();
    const c = await mk();
    const d = await mk();
    await inquiriesService.setStatus(a.publicId, { subStatus: "persistent" });
    await inquiriesService.setStatus(c.publicId, { subStatus: "undeliverable" });
    await db.update(inquiries).set({ subStatus: "took_trial", stage: "converted" }).where(eq(inquiries.id, d.id));
    expect(await inquiriesService.groupCounts(undefined)).toEqual({ lead: 1, followUp: 1, took: 1, lost: 1 });
  });
});
