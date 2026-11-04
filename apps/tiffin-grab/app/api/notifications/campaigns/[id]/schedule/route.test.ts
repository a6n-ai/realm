import { describe, expect, it, vi } from "vitest";

const wake = vi.hoisted(() => vi.fn());
vi.mock("@foundry/routes", () => ({
  handler: (fn: unknown) => fn,
  json: (b: unknown) => Response.json(b),
  problem: (status: number, m: string) => Response.json({ error: m }, { status }),
}));
vi.mock("@relay/engine", () => ({
  scheduleCampaign: async (_d: unknown, _id: string, at: number | null) => ({ scheduledAt: at }),
  zonedLocalToEpoch: () => 4_000_000,
}));
vi.mock("@/lib/services/customer-groups.service", () => ({ staleGroupsForCampaign: async () => [] }));
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => {} }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/notifications/tables", () => ({ notificationTables: {}, usersRef: {} }));
vi.mock("@/lib/notifications/campaign-config", () => ({ campaignConfig: async () => ({}) }));
vi.mock("@/lib/campaigns/segment", () => ({ resolveSegment: () => {} }));
vi.mock("@/lib/runtime/workflow-wake", () => ({ scheduleCampaignWake: wake }));
vi.mock("@/lib/services/app-settings.service", () => ({ getAppSettings: async () => ({ timezone: "America/Toronto" }) }));

import { POST } from "./route";

const call = (localDateTime: string | null) =>
  (POST as unknown as (r: Request, c: unknown) => Promise<Response>)(
    new Request("https://x", { method: "POST", body: JSON.stringify({ localDateTime }) }),
    { params: Promise.resolve({ id: "c1" }) },
  );

describe("campaign schedule route", () => {
  it("wakes the tick at the scheduled time", async () => {
    await call("2026-12-01T09:00");
    expect(wake).toHaveBeenCalledWith(4_000_000);
  });
  it("does not wake when unscheduling", async () => {
    wake.mockClear();
    await call(null);
    expect(wake).not.toHaveBeenCalled();
  });
});
