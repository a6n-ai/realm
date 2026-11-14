import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { ensureSystemUser, deleteNonSystemUsers } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiryActivities, leadSources, leadSubsources, orders } from "@/db/schema";
import { insertTestInquiry, insertTestOrder, insertTestUser, resetInquiryData, testEmail } from "./helpers/inquiry-fixtures";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const core = await import("../inquiry-core");

async function reset() {
  await resetInquiryData();
  await db.delete(orders);
  await deleteNonSystemUsers();
}

describe("inquiry-core", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("findMatch ranks an open row above a newer converted row and reports the conflict", async () => {
    const email = testEmail();
    const open = await insertTestInquiry({ email, stage: "new" });
    const converted = await insertTestInquiry({ phone: "+16475550101", stage: "converted", subStatus: "took_plan" });
    const r = await core.findMatch("+16475550101", email);
    expect(r.match?.id).toBe(open.id);
    expect(r.conflictWith?.id).toBe(converted.id);
  });

  it("findMatch returns no conflict when one row matches both identifiers", async () => {
    const email = testEmail();
    const row = await insertTestInquiry({ email, phone: "+16475550102" });
    const r = await core.findMatch("+16475550102", email);
    expect(r.match?.id).toBe(row.id);
    expect(r.conflictWith).toBeNull();
  });

  it("findMatch finds a lost row that findOpenMatch ignores", async () => {
    const lost = await insertTestInquiry({ phone: "+16475550103", stage: "lost", subStatus: "lost" });
    expect((await core.findMatch("+16475550103")).match?.id).toBe(lost.id);
    expect(await core.findOpenMatch("+16475550103")).toBeNull();
  });

  it("fillEmpty fills only empty fields and skips identifiers another row holds", async () => {
    const held = testEmail();
    await insertTestInquiry({ email: held });
    const row = await insertTestInquiry({ phone: "+16475550104" });
    const r = await core.fillEmpty(row, { email: held, postalCode: "M5V 2T6", phone: "+16475550000" });
    expect(r.patch).toEqual({ postalCode: "M5V 2T6" });
    expect(r.skipped).toEqual(["email"]);
  });

  it("fillEmpty replaces only a generated name", async () => {
    const generated = await insertTestInquiry({ fullName: "Lead 7", leadNumber: 7, phone: "+16475550105" });
    const real = await insertTestInquiry({ fullName: "Asha", phone: "+16475550106" });
    expect((await core.fillEmpty(generated, { fullName: "Asha Rao" })).patch).toEqual({ fullName: "Asha Rao" });
    expect((await core.fillEmpty(real, { fullName: "Asha Rao" })).patch).toEqual({});
  });

  it("addActivity stamps the inquiry's current_order_id unless orderId is given", async () => {
    const u = await insertTestUser();
    const o = await insertTestOrder(u.id);
    const inq = await insertTestInquiry({ phone: "+16475550107", currentOrderId: o.id });
    const stamped = await core.addActivity({ inquiryId: inq.id, type: "note", note: "x" });
    expect(stamped.orderId).toBe(o.id);
    const explicit = await core.addActivity({ inquiryId: inq.id, type: "note", note: "y", orderId: null });
    expect(explicit.orderId).toBeNull();
    const rows = await db.select().from(inquiryActivities).where(eq(inquiryActivities.inquiryId, inq.id));
    expect(rows).toHaveLength(2);
  });

  it("resolveSource matches the sub-source under its own source", async () => {
    const [web] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, "website"));
    const [fb] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, "facebook"));
    await db.insert(leadSubsources).values([
      { sourceId: web.id, key: "dup-core", label: "Dup web" },
      { sourceId: fb.id, key: "dup-core", label: "Dup fb" },
    ]);
    try {
      const r = await core.resolveSource("facebook", "dup-core");
      const [sub] = await db.select().from(leadSubsources).where(and(eq(leadSubsources.sourceId, fb.id), eq(leadSubsources.key, "dup-core")));
      expect(r.subSourceId).toBe(sub.id);
    } finally {
      await db.delete(leadSubsources).where(eq(leadSubsources.key, "dup-core"));
    }
  });
});
