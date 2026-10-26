import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string } } }));
const userId = vi.hoisted(() => ({ current: null as bigint | null }));
const visibleOrders = vi.hoisted(() => new Set<string>());
const ownedOrders = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/auth/session", () => ({ getSession: async () => session.current }));
vi.mock("@/lib/services/session-service", () => ({ currentUserId: async () => userId.current }));
vi.mock("@/lib/services/orders.service", () => ({
  resolveSessionVisibleOrgIds: async () => ["org_a"],
  assertOrderVisible: async (id: string) => {
    if (!visibleOrders.has(id)) throw new NotFoundError("Order not found");
  },
}));
vi.mock("@/lib/services/customer-deliveries.service", () => ({
  assertOwnsOrder: async (_u: bigint, id: string) => {
    if (!ownedOrders.has(id)) throw new NotFoundError("Subscription not found");
  },
}));
vi.mock("@/lib/billing/receipt", () => ({ loadReceipt: async () => ({ code: "TG-1" }) }));
vi.mock("@/lib/billing/receipt-pdf", () => ({ renderReceiptPdf: async () => new Uint8Array([37, 80, 68, 70]) }));

const { GET } = await import("../route");
const get = (id: string) => GET(new Request(`https://app.test/api/receipts/${id}`), { params: Promise.resolve({ orderId: id }) });

describe("GET /api/receipts/[orderId]", () => {
  beforeEach(() => {
    session.current = null;
    userId.current = null;
    visibleOrders.clear();
    ownedOrders.clear();
  });

  it("404s with no session and no signature", async () => {
    expect((await get("ord_1")).status).toBe(404);
  });

  it("lets staff download an order in their organization", async () => {
    session.current = { user: { id: "u1", role: "member" } };
    visibleOrders.add("ord_1");
    const res = await get("ord_1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("404s staff on an order outside their organizations", async () => {
    session.current = { user: { id: "u1", role: "admin" } };
    expect((await get("ord_2")).status).toBe(404);
  });

  it("lets a customer download only their own order", async () => {
    session.current = { user: { id: "u2", role: "user" } };
    userId.current = 7n;
    ownedOrders.add("ord_mine");
    visibleOrders.add("ord_other");
    expect((await get("ord_mine")).status).toBe(200);
    expect((await get("ord_other")).status).toBe(404);
  });
});
