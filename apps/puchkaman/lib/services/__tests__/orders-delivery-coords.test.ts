import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string } } }));
const clover = vi.hoisted(() => ({
  payloads: [] as unknown[],
}));

vi.mock("@/lib/auth/session", () => ({ getSession: async () => session.current }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/notifications/enqueue", () => ({
  enqueueNotification: async () => {},
  enqueueStaff: async () => {},
}));
// Pickup-only path: createCheckout's own resolveAddress()/zone lookup is not
// under test here (that's the discount/distance path, unaffected by this
// task's lat/lng plumbing), so no delivery fulfillment is exercised.
vi.mock("@/lib/delivery/zones.service", () => ({
  getAllDeliveryTypes: async () => [],
  getStoreOrigin: async () => ({ lat: 0, lng: 0 }),
  getZonesWithTypes: async () => [],
}));
vi.mock("@/lib/services/inventory.service", () => ({
  inventoryCatalogService: { discounts: { listRedeemable: async () => [] } },
}));
vi.mock("@/lib/clover/client", () => ({
  createCloverClient: async () => ({
    getPakmsApiKey: async () => ({ apiAccessKey: "pakms_test" }),
    webOrderTypeId: () => undefined,
    environment: () => "sandbox" as const,
    checkoutAtomicOrder: async (input: unknown) => {
      clover.payloads.push(input);
      return { subtotal: 1000, totalTaxAmount: 0, total: 1000 };
    },
    createAtomicOrder: async (input: unknown) => {
      clover.payloads.push(input);
      return { id: `clv_${Date.now()}` };
    },
  }),
}));

const { db } = await import("@/db/client");
const { orderItems, orders, payments, products } = await import("@/db/schema");
const { ordersService } = await import("../orders.service");

const MARK = "orders-delivery-coords";
const productIds: bigint[] = [];

beforeEach(async () => {
  clover.payloads.length = 0;
  session.current = null;
});

afterEach(async () => {
  const guestOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.customerEmail, `${MARK}@example.test`));
  if (guestOrders.length) {
    const ids = guestOrders.map((o) => o.id);
    await db.delete(payments).where(inArray(payments.orderId, ids));
    await db.delete(orderItems).where(inArray(orderItems.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
  }
  if (productIds.length) {
    await db.delete(products).where(inArray(products.id, productIds));
    productIds.length = 0;
  }
});

async function insertProduct() {
  const [row] = await db
    .insert(products)
    .values({
      name: `${MARK}-product`,
      category: "snacks",
      price: "10.00",
      active: true,
      cloverItemId: `clover-item-${MARK}-${Date.now()}`,
    })
    .returning();
  productIds.push(row.id);
  return row;
}

function checkoutInput(productPublicId: string) {
  return {
    items: [{ productPublicId, quantity: 1, modifiers: [] }],
    contact: { name: "Ada", email: `${MARK}@example.test`, phone: "+14165550123" },
    fulfillment: { type: "pickup" as const },
    discounts: { offerPublicIds: [] },
  };
}

describe("createCheckout delivery coordinates", () => {
  it("stores and round-trips lat/lng when the caller passes resolved coordinates", async () => {
    const product = await insertProduct();
    const result = await ordersService.createCheckout(checkoutInput(product.publicId), {
      lat: 43.65107,
      lng: -79.347015,
    });
    const [row] = await db.select().from(orders).where(eq(orders.publicId, result.orderPublicId));
    expect(Number(row.deliveryLat)).toBeCloseTo(43.65107, 6);
    expect(Number(row.deliveryLng)).toBeCloseTo(-79.347015, 6);
  });

  it("stores null lat/lng when no coordinates are given (existing behavior, unmodified)", async () => {
    const product = await insertProduct();
    const result = await ordersService.createCheckout(checkoutInput(product.publicId));
    const [row] = await db.select().from(orders).where(eq(orders.publicId, result.orderPublicId));
    expect(row.deliveryLat).toBeNull();
    expect(row.deliveryLng).toBeNull();
  });
});
