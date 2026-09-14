import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/guards", () => ({ requireStaff: async () => undefined }));
vi.mock("@/lib/services/session-service", () => ({ currentUserId: async () => 7n }));

const assignDriverMock = vi.fn(async () => undefined);
const pullRoutesMock = vi.fn(async () => ({ date: "2026-01-01", matched: 0, cleared: 0, unknownOrderNos: [], stops: [] }));

vi.mock("@/lib/services/optimoroute/drivers", () => ({
  assignDriver: (...args: Parameters<typeof assignDriverMock>) => assignDriverMock(...args),
  listKnownDrivers: async () => [],
}));
vi.mock("@/lib/services/optimoroute/pull", () => ({
  pullRoutes: (...args: Parameters<typeof pullRoutesMock>) => pullRoutesMock(...args),
}));
vi.mock("@/lib/services/optimoroute/push", () => ({
  pushDay: async () => ({}),
  removeStops: async () => ({}),
}));
vi.mock("@/lib/services/optimoroute/completions", () => ({
  pullCompletions: async () => ({}),
}));

const { reassignDriverAction } = await import("../actions");

describe("reassignDriverAction", () => {
  it("passes the resolved actorId through to assignDriver, and pulls routes to refresh local state", async () => {
    const result = await reassignDriverAction("dlv_1", "2026-01-01", "005");

    expect(result).toEqual({ ok: true });
    expect(assignDriverMock).toHaveBeenCalledWith("dlv_1", "2026-01-01", "005", 7n);
    expect(pullRoutesMock).toHaveBeenCalledWith("2026-01-01");
  });

  it("does not turn a successful assignment into a failure when the follow-up pull fails", async () => {
    pullRoutesMock.mockRejectedValueOnce(new Error("OptimoRoute is down"));

    const result = await reassignDriverAction("dlv_2", "2026-01-01", "005");

    expect(result).toEqual({ ok: true });
  });

  it("reports failure when assignDriver itself throws", async () => {
    assignDriverMock.mockRejectedValueOnce(new Error("No planned delivery"));

    const result = await reassignDriverAction("dlv_3", "2026-01-01", "005");

    expect(result).toEqual({ ok: false, message: "No planned delivery" });
  });
});
