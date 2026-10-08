import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrder, getEvents, searchOrdersForDate } from "../client";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("../config", () => ({ optimoRouteApiKey: () => "test-key" }));

// Mock fetch to capture request payloads.
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockFetchOnce(response: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    text: async () => JSON.stringify(response),
  } as Response);
  return mockFetch;
}

describe("createOrder", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("includes selectedDriver in the create_order request body when provided", async () => {
    const fetchSpy = mockFetchOnce({ success: true });
    await createOrder({
      operation: "MERGE",
      orderNo: "abc123",
      date: "2026-09-14",
      type: "D",
      selectedDriver: { driverSerial: "005" },
    });
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.selectedDriver).toEqual({ driverSerial: "005" });
  });
});

describe("searchOrdersForDate", () => {
  beforeEach(() => mockFetch.mockReset());

  it("asks for one date with order data and schedule info, and follows after_tag", async () => {
    mockFetchOnce({ success: true, orders: [{ id: "a", data: { orderNo: "D1" }, scheduleInformation: null }], after_tag: "t1" });
    mockFetchOnce({ success: true, orders: [{ id: "b", data: { orderNo: "D2" }, scheduleInformation: { driverName: "Driver 4", stopNumber: 3 } }] });

    const orders = await searchOrdersForDate("2026-10-08");

    expect(orders.map((o) => o.id)).toEqual(["a", "b"]);
    const first = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(first).toEqual({
      dateRange: { from: "2026-10-08", to: "2026-10-08" },
      includeOrderData: true,
      includeScheduleInformation: true,
    });
    const second = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
    expect(second.after_tag).toBe("t1");
  });

  it("throws when OptimoRoute says success=false", async () => {
    mockFetchOnce({ success: false, message: "bad range" });
    await expect(searchOrdersForDate("2026-10-08")).rejects.toThrow("bad range");
  });
});

describe("getEvents", () => {
  beforeEach(() => mockFetch.mockReset());

  it("passes the tag and returns events, the next tag and the remaining count", async () => {
    mockFetchOnce({
      success: true,
      tag: "next",
      remainingEvents: 2,
      events: [{ event: "success", unixTimestamp: 1, orderNo: "D1", orderId: "x" }],
    });

    const r = await getEvents("prev");

    expect(String(mockFetch.mock.calls[0][0])).toContain("/get_events?after_tag=prev");
    expect(r).toEqual({ events: [{ event: "success", unixTimestamp: 1, orderNo: "D1", orderId: "x" }], tag: "next", remaining: 2 });
  });

  it("keeps the old tag when the response has none", async () => {
    mockFetchOnce({ success: true, events: [] });
    expect((await getEvents("same")).tag).toBe("same");
  });
});
