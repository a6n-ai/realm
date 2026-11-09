import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSystemUser, deleteNonSystemUsers } from "@/db/test-helpers";
import { eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, ledgerEntries, orders, payments, users } from "@/db/schema";
import { nextWeekday, ValidationError } from "@foundry/commons";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import type { CreateOrderInput } from "../orders.service";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
const makeTrial = { on: false };
vi.mock("../orders.service", async (orig) => {
  const actual = await orig<typeof import("../orders.service")>();
  return {
    ...actual,
    createOrder: async (...args: Parameters<typeof actual.createOrder>) => {
      const r = await actual.createOrder(...args);
      if (makeTrial.on) await db.update(orders).set({ trialLength: 3 }).where(eq(orders.deploymentId, r.deploymentId));
      return r;
    },
  };
});

vi.mock("@/lib/auth/guards", () => ({ requireStaff: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { inquiriesService } = await import("../inquiries.service");
const { bulkSetStatus } = await import("@/app/(dashboard)/dashboard/inquiries/actions");

const email = () => `inq-${Math.random().toString(36).slice(2)}@test.invalid`;
let n = 0;
const phone = () => `+1647556${String(1000 + n++)}`;

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(payments);
  await db.delete(orders);
  await deleteNonSystemUsers();
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

describe("inquiriesService.createOrFold starting status", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("writes the sub-status, its stage and the created activity", async () => {
    const { inquiry } = await inquiriesService.createOrFold({ phone: phone(), sourceKey: "manual", subStatus: "expected" });
    const r = await row(inquiry.id);
    expect(r.subStatus).toBe("expected");
    expect(r.stage).toBe("follow_up");
    const created = (await acts(inquiry.id)).find((a) => a.type === "created");
    expect(created?.toSubStatus).toBe("expected");
  });

  it("rejects closing and convert-only statuses", async () => {
    for (const subStatus of ["lost", "undeliverable", "took_plan"]) {
      await expect(inquiriesService.createOrFold({ phone: phone(), sourceKey: "manual", subStatus })).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("a fold leaves the existing lead's status unchanged", async () => {
    const p = phone();
    const a = await inquiriesService.createOrFold({ phone: p, sourceKey: "manual", subStatus: "responded" });
    const b = await inquiriesService.createOrFold({ phone: p, sourceKey: "manual", subStatus: "expected" });
    expect(b.folded).toBe(true);
    const r = await row(a.inquiry.id);
    expect(r.subStatus).toBe("responded");
    expect(r.stage).toBe("contacted");
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

  it("bulkSetStatus updates open leads and skips closed ones", async () => {
    const a = await mk();
    const b = await mk();
    await inquiriesService.setStatus(b.publicId, { subStatus: "undeliverable" });
    const res = await bulkSetStatus([a.publicId, b.publicId], "responded");
    expect(res).toEqual({ ok: true, updated: 1, skipped: 1 });
    expect((await row(a.id)).subStatus).toBe("responded");
    expect((await row(b.id)).subStatus).toBe("undeliverable");
    expect(await bulkSetStatus([a.publicId], "lost")).toEqual({ error: expect.stringContaining("bulk") });
    expect(await bulkSetStatus([a.publicId], "took_plan")).toEqual({ error: expect.stringContaining("bulk") });
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

  it("reopening a lost lead is refused while another open lead has its phone", async () => {
    const old = await mk();
    await inquiriesService.setStatus(old.publicId, { subStatus: "lost", lostReason: "asked_to_stop" });
    const fresh = await inquiriesService.create({ fullName: "Again", phone: old.phone, sourceKey: "manual" });
    await expect(inquiriesService.setStatus(old.publicId, { subStatus: null })).rejects.toThrow(fresh.publicId);
    expect((await row(old.id)).stage).toBe("lost");
  });

  it("rejects a non-finite follow-up", async () => {
    const inq = await mk();
    await expect(inquiriesService.setStatus(inq.publicId, { subStatus: "future", nextFollowUpAt: NaN })).rejects.toThrow(ValidationError);
    await expect(inquiriesService.logActivity(inq.publicId, { type: "call", nextFollowUpAt: NaN })).rejects.toThrow(ValidationError);
    await expect(inquiriesService.addNote(inq.publicId, "x", NaN)).rejects.toThrow(ValidationError);
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

  it("changeStage to the current stage is a no-op", async () => {
    const inq = await mk();
    await inquiriesService.changeStage(inq.publicId, "new");
    await inquiriesService.setStatus(inq.publicId, { subStatus: "responded" });
    await inquiriesService.changeStage(inq.publicId, "contacted");
    expect((await acts(inq.id)).filter((x) => x.type === "stage_change")).toHaveLength(1);
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

  it("groupCounts ignores converted/lost rows with a null sub-status", async () => {
    const a = await mk();
    const b = await mk();
    await mk();
    await db.update(inquiries).set({ stage: "converted", subStatus: null }).where(eq(inquiries.id, a.id));
    await db.update(inquiries).set({ stage: "lost", subStatus: null }).where(eq(inquiries.id, b.id));
    expect((await inquiriesService.groupCounts(undefined)).lead).toBe(1);
  });
});

describe("inquiriesService.convert contact + status", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
    makeTrial.on = false;
    const [staff] = await db
      .insert(users)
      .values({ email: email(), name: "Agent Staff", role: "member" })
      .returning({ publicId: users.publicId });
    session.user = { id: staff.publicId, role: "member" };
  });
  afterAll(async () => {
    session.user = null;
    await reset();
  });

  async function orderInput(contact: { phone: string; email: string; fullName?: string }): Promise<CreateOrderInput> {
    const snap = await loadCatalogSnapshot();
    return {
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId,
        frequencyKey: "5_day",
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
      },
      contact: { fullName: "Lead", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6", ...contact },
    };
  }
  const contact = () => ({ phone: phone(), email: email() });

  it("writes phone/email back and sets took_plan", async () => {
    const inq = await inquiriesService.create({ fullName: "No Contact", sourceKey: "manual" });
    const c = contact();
    await inquiriesService.convert(inq.publicId, await orderInput(c));
    const r = await row(inq.id);
    expect(r.phone).toBe(c.phone);
    expect(r.email).toBe(c.email);
    expect(r.subStatus).toBe("took_plan");
    expect(r.stage).toBe("converted");
    expect(r.convertedOrderId).not.toBeNull();
    expect((await acts(inq.id)).some((a) => a.toSubStatus === "took_plan")).toBe(true);
  });

  it("sets took_trial for a trial order", async () => {
    makeTrial.on = true;
    const inq = await inquiriesService.create({ fullName: "Trial", sourceKey: "manual" });
    await inquiriesService.convert(inq.publicId, await orderInput(contact()));
    expect((await row(inq.id)).subStatus).toBe("took_trial");
  });

  it("rejects when another open lead holds the email, creating no order", async () => {
    const other = await mk();
    const inq = await inquiriesService.create({ fullName: "Mine", sourceKey: "manual" });
    await expect(
      inquiriesService.convert(inq.publicId, await orderInput({ phone: phone(), email: other.email! })),
    ).rejects.toThrow(other.publicId);
    expect(await db.select().from(orders)).toHaveLength(0);
    expect((await row(inq.id)).stage).not.toBe("converted");
  });

  it("allows converting when phone and email match this same inquiry", async () => {
    const inq = await mk();
    await inquiriesService.convert(inq.publicId, await orderInput({ phone: inq.phone!, email: inq.email! }));
    expect((await row(inq.id)).stage).toBe("converted");
  });

  it("requires a name", async () => {
    const inq = await mk();
    await expect(inquiriesService.convert(inq.publicId, await orderInput({ ...contact(), fullName: " " }))).rejects.toThrow("Name is required");
  });

  it("requires phone and email", async () => {
    const inq = await mk();
    await expect(inquiriesService.convert(inq.publicId, await orderInput({ phone: "", email: email() }))).rejects.toBeInstanceOf(ValidationError);
    await expect(inquiriesService.convert(inq.publicId, await orderInput({ phone: phone(), email: " " }))).rejects.toBeInstanceOf(ValidationError);
  });
});
