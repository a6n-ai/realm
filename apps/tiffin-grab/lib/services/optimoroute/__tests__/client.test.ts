import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrder } from "../client";

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
