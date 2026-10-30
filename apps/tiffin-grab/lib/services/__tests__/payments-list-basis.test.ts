import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { payments } = await import("@/db/schema");
const { listPayments } = await import("@/app/(dashboard)/dashboard/payments/payment-queries");
const { makeStripePayment, reset, cleanup } = await import("./stripe-fixture");
afterAll(cleanup);

// Toronto: October is [Oct 1 00:00 EDT, Nov 1 00:00 EDT), November starts the same instant.
const OCT = { from: String(Date.parse("2026-10-01T04:00:00Z")), to: String(Date.parse("2026-11-01T04:00:00Z") - 1) };
const NOV = { from: String(Date.parse("2026-11-01T04:00:00Z")), to: String(Date.parse("2026-12-01T05:00:00Z") - 1) };

describe("payments list date basis", () => {
  beforeEach(reset);

  it("basis=money dates by capture; the default dates by creation", async () => {
    const p = await makeStripePayment({ amount: "10.00", piId: "pi_basis", paid: true });
    await db.update(payments).set({ createdAt: Date.parse("2026-10-31T16:00:00Z"), capturedAt: Date.parse("2026-11-01T16:00:00Z") }).where(eq(payments.id, p.id));
    const ids = async (sp: object) => (await listPayments(sp)).rows.map((r) => r.publicId);
    expect(await ids({ ...OCT })).toEqual([p.publicId]);
    expect(await ids({ ...NOV })).toEqual([]);
    expect(await ids({ ...OCT, basis: "money" })).toEqual([]);
    expect(await ids({ ...NOV, basis: "money" })).toEqual([p.publicId]);
  });
});
