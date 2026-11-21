import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  can: vi.fn(),
  getOptimoRouteStatus: vi.fn(),
  nextRoutePushStatus: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/guards", () => ({ can: m.can }));
vi.mock("@/lib/orders/fulfillment", () => ({ fulfillmentReadyOrder: () => undefined }));
vi.mock("@/lib/settings", () => ({ getAppSettings: async () => ({ timezone: "America/Toronto" }) }));
vi.mock("@/lib/dates/request-now", () => ({ requestNow: () => Date.parse("2026-11-20T18:00:00Z") }));
vi.mock("../config", () => ({ getOptimoRouteStatus: m.getOptimoRouteStatus }));
vi.mock("../push-status", () => ({ nextRoutePushStatus: m.nextRoutePushStatus }));

const { getNextPushLine, getRouteLine } = await import("../today-status");

const grant = (delivery: boolean, settings: boolean) =>
  m.can.mockImplementation(async (p: Record<string, unknown>) => ("delivery" in p ? delivery : settings));

beforeEach(() => {
  vi.clearAllMocks();
  m.getOptimoRouteStatus.mockResolvedValue({ installed: true, hasApiKey: true });
});

describe("OptimoRoute sidebar status gating", () => {
  it("shows nothing for the today line without delivery or settings permission", async () => {
    grant(false, false);
    expect(await getRouteLine()).toBeNull();
    expect(m.getOptimoRouteStatus).not.toHaveBeenCalled();
  });

  it("shows no next-push line without delivery:read, and never queries the push state", async () => {
    grant(false, true);
    expect(await getNextPushLine()).toBeNull();
    expect(m.nextRoutePushStatus).not.toHaveBeenCalled();
  });

  it("shows no next-push line when OptimoRoute is not installed", async () => {
    grant(true, true);
    m.getOptimoRouteStatus.mockResolvedValue({ installed: false, hasApiKey: false });
    expect(await getNextPushLine()).toBeNull();
    expect(m.nextRoutePushStatus).not.toHaveBeenCalled();
  });
});
