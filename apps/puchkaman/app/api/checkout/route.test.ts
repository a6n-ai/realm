import { describe, expect, it, vi, beforeEach } from "vitest";

// createCheckout itself is heavy (Clover client, pricing, DB tx) and already
// covered by lib/services/__tests__/orders-delivery-coords.test.ts — this
// file is only about the route's own trust boundary: does it ever forward a
// client-asserted lat/lng, or does it always re-resolve server-side first?
const createCheckout = vi.hoisted(() =>
  vi.fn(async (_input: unknown, _resolvedDelivery?: { lat: number; lng: number } | null) => ({
    orderPublicId: "ord_x",
  })),
);
const resolveAndPersist = vi.hoisted(() =>
  vi.fn(async () => ({ lat: 11.111111, lng: 22.222222, formattedAddress: "1 St, Toronto" })),
);

vi.mock("@/lib/services/orders.service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/orders.service")>(
    "@/lib/services/orders.service",
  );
  return { ...actual, ordersService: { createCheckout } };
});
vi.mock("@foundry/places", () => ({ resolveAndPersist }));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const baseInput = {
  items: [{ productPublicId: "prd_1", quantity: 1, modifiers: [] }],
  contact: { name: "Ada", email: "ada@example.test", phone: "+14165550123" },
  discounts: { offerPublicIds: [] },
};

describe("POST /api/checkout — delivery coordinate trust boundary", () => {
  beforeEach(() => {
    createCheckout.mockClear();
    resolveAndPersist.mockClear();
  });

  it("re-resolves placeId/address server-side and ignores a client-supplied lat/lng entirely", async () => {
    const res = await post({
      ...baseInput,
      fulfillment: {
        type: "delivery",
        deliveryTypeKey: "instant",
        address: "1 St, Toronto",
        placeId: "place_123",
      },
      // Spoofed coordinates a malicious client could send — right next to the
      // shop, unrelated to the resolved address. Must never reach storage.
      resolvedDelivery: { lat: 0, lng: 0 },
    });

    expect(res.status).toBe(200);
    expect(resolveAndPersist).toHaveBeenCalledTimes(1);
    expect(resolveAndPersist).toHaveBeenCalledWith({ placeId: "place_123", address: "1 St, Toronto" });
    expect(createCheckout).toHaveBeenCalledTimes(1);
    const [, resolvedDelivery] = createCheckout.mock.calls[0]!;
    expect(resolvedDelivery).toEqual({ lat: 11.111111, lng: 22.222222 });
  });

  it("never calls resolveAndPersist for a pickup order and stores null coordinates", async () => {
    const res = await post({ ...baseInput, fulfillment: { type: "pickup" } });

    expect(res.status).toBe(200);
    expect(resolveAndPersist).not.toHaveBeenCalled();
    const [, resolvedDelivery] = createCheckout.mock.calls[0]!;
    expect(resolvedDelivery).toBeNull();
  });

  it("a failed resolve stores null coordinates rather than throwing", async () => {
    resolveAndPersist.mockRejectedValueOnce(new Error("AWS unavailable"));
    const res = await post({
      ...baseInput,
      fulfillment: { type: "delivery", deliveryTypeKey: "instant", address: "1 St, Toronto" },
    });

    expect(res.status).toBe(200);
    const [, resolvedDelivery] = createCheckout.mock.calls[0]!;
    expect(resolvedDelivery).toBeNull();
  });
});
