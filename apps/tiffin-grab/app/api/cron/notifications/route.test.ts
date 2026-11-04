import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);
const pendingAt = vi.hoisted(() => ({ value: null as number | null }));
const nextAt = vi.hoisted(() => ({ value: null as number | null }));
vi.mock("@/lib/runtime/workflow-wake", () => ({
  scheduleCampaignWake: async (at: number) => void calls.push(`wake:${at}`),
}));
vi.mock("@/lib/notifications/drain", () => ({
  materializeDue: async () => (calls.push("materialize"), 2),
  drainPending: async () => (calls.push("drain"), 3),
}));
vi.mock("@/lib/notifications/notify-next", () => ({ computeNotifyNextAt: async () => (calls.push("compute"), nextAt.value), earliestPendingAt: async () => pendingAt.value }));
vi.mock("@/lib/cron/run", () => ({ runCronJob: vi.fn() }));

import { POST } from "./route";

const req = (auth?: string) =>
  new Request("https://internal/api/cron/notifications?mode=tick", { method: "POST", headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  calls.length = 0;
  pendingAt.value = null;
  nextAt.value = null;
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("notifications tick", () => {
  it("schedules the next wake for the earliest scheduled campaign, never in the past", async () => {
    nextAt.value = Date.now() + 3600_000;
    await POST(req("Bearer s3cret"));
    expect(calls).toEqual(["materialize", "drain", "compute", `wake:${nextAt.value}`]);
    calls.length = 0;
    nextAt.value = 5;
    await POST(req("Bearer s3cret"));
    const at = Number(calls.at(-1)!.slice(5));
    expect(at).toBeGreaterThan(Date.now() + 50_000);
  });

  it("schedules nothing when no campaign is scheduled", async () => {
    const res = await POST(req("Bearer s3cret"));
    expect(await res.json()).toEqual({ ok: true, retryAfterMs: null, summary: { materialized: 2, processed: 3 } });
    expect(calls).toEqual(["materialize", "drain", "compute"]);
  });

  it("reports how long until a still-pending row is due, for the Queue retry", async () => {
    pendingAt.value = Date.now() + 120_000;
    const { retryAfterMs } = await (await POST(req("Bearer s3cret"))).json();
    expect(retryAfterMs).toBeGreaterThan(100_000);
    expect(retryAfterMs).toBeLessThanOrEqual(120_000);
  });

  it("schedules nothing when unauthorized", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(calls).toEqual([]);
  });
});
