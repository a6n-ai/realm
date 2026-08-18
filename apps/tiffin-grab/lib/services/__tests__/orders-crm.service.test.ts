import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@realm/commons");
const { createOrder } = await import("../orders.service");
const { listOrdersPage, readOrder, resolveSessionVisibleOrgIds } = await import("../orders.service");
const { eq: cEq } = await import("@realm/commons/model/condition");
const { organization, member } = await import("@/db/schema");
const { eq } = await import("drizzle-orm");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

const baseInput = (mealSizePublicId: string, planKey: string, fullName = "Jane Customer", phone = "+16475550111") => ({
  planKey,
  selections: {
    mealSizeId: mealSizePublicId,
    frequencyKey: "5_day" as const,
    persons: 1,
    mealSlots: ["lunch"],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: 1,
    startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
  },
  contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
});

describe("order CRM queries (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("listOrdersPage filters by Condition, search, and paginates with a total", async () => {
    const snap = await loadCatalogSnapshot();
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Jane Customer", "+16475550111"));
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"));

    // Page slice: 2 rows, size 1 -> first page has 1 item but total reflects all matches.
    const firstPage = await listOrdersPage(undefined, { page: 0, size: 1 }, undefined, "all");
    expect(firstPage.items.length).toBe(1);
    expect(firstPage.total).toBe(2);
    expect(firstPage.size).toBe(1);

    const secondPage = await listOrdersPage(undefined, { page: 1, size: 1 }, undefined, "all");
    expect(secondPage.items.length).toBe(1);
    expect(secondPage.items[0].publicId).not.toBe(firstPage.items[0].publicId);

    // Condition filter: no order is "pending" after createOrder, so total is 0.
    const pending = await listOrdersPage(cEq("status", "pending"), { page: 0, size: 10 }, undefined, "all");
    expect(pending.total).toBe(0);
    expect(pending.items.length).toBe(0);

    // Search facet: fullName filter (was covered by the now-removed listOrders() test).
    const byName = await listOrdersPage(cEq("fullName", "Jane Customer"), { page: 0, size: 10 }, undefined, "all");
    expect(byName.items.map((r) => r.fullName)).toEqual(["Jane Customer"]);
  });

  it("listOrdersPage scopes by organization visibility (resolveSessionVisibleOrgIds)", async () => {
    const snap = await loadCatalogSnapshot();
    const suffix = Math.random().toString(36).slice(2);
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: `A-${suffix}` })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: `B-${suffix}` })
      .returning({ id: organization.id });

    const { publicId: orderAId } = await createOrder(
      baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Jane Customer", "+16475550111"),
    );
    const { publicId: orderBId } = await createOrder(
      baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"),
    );
    await db.update(orders).set({ organizationId: orgA.id }).where(eq(orders.publicId, orderAId));
    await db.update(orders).set({ organizationId: orgB.id }).where(eq(orders.publicId, orderBId));

    const [staffUser] = await db
      .insert(users)
      .values({ name: "Staff", email: `staff${suffix}@test.invalid`, role: "member", status: "active" })
      .returning({ id: users.id, publicId: users.publicId });
    await db.insert(member).values({ organizationId: orgA.id, userId: staffUser.id, role: "member" });

    // Single-member-org session: sees only orgA's order.
    const scopedVisible = await resolveSessionVisibleOrgIds({ user: { id: staffUser.publicId, platformRole: null } });
    const scopedPage = await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, scopedVisible);
    expect(scopedPage.items.map((r) => r.publicId)).toEqual([orderAId]);

    // super_admin session: sees all orders regardless of membership.
    const superVisible = await resolveSessionVisibleOrgIds({
      user: { id: staffUser.publicId, platformRole: "super_admin" },
    });
    const superPage = await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, superVisible);
    expect(superPage.items.map((r) => r.publicId).sort()).toEqual([orderAId, orderBId].sort());

    // Zero-membership session: sees no orders, not the whole table.
    const [noMemberUser] = await db
      .insert(users)
      .values({ name: "No Org Staff", email: `nomember${suffix}@test.invalid`, role: "member", status: "active" })
      .returning({ id: users.id, publicId: users.publicId });
    const noneVisible = await resolveSessionVisibleOrgIds({ user: { id: noMemberUser.publicId, platformRole: null } });
    const nonePage = await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, noneVisible);
    expect(nonePage.items.length).toBe(0);
    expect(nonePage.total).toBe(0);
  });

  it("readOrder returns detail with plan/payment info", async () => {
    const snap = await loadCatalogSnapshot();
    const { publicId } = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    const detail = await readOrder(publicId, "all");
    expect(detail.publicId).toBe(publicId);
    expect(detail.planName).toBeTruthy();
    expect(detail.payments.length).toBeGreaterThan(0);
  });

  it("readOrder scopes by organization visibility, failing closed like a 404", async () => {
    const snap = await loadCatalogSnapshot();
    const suffix = Math.random().toString(36).slice(2);
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: `RA-${suffix}` })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: `RB-${suffix}` })
      .returning({ id: organization.id });
    const { publicId } = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    await db.update(orders).set({ organizationId: orgA.id }).where(eq(orders.publicId, publicId));

    await expect(readOrder(publicId, [orgB.id])).rejects.toThrow(/not found/i);
    const detail = await readOrder(publicId, [orgA.id]);
    expect(detail.publicId).toBe(publicId);
    const allDetail = await readOrder(publicId, "all");
    expect(allDetail.publicId).toBe(publicId);
  });
});
