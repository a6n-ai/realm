import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);
const pendingAt = vi.hoisted(() => ({ value: null as number | null }));
vi.mock("@/lib/runtime/cron-markers", () => ({
  setNotifyNext: async (at: number | null) => void calls.push(`next:${at}`),
}));
vi.mock("@/lib/notifications/drain", () => ({
  materializeDue: async () => (calls.push("materialize"), 2),
  drainPending: async () => (calls.push("drain"), 3),
}));
vi.mock("@/lib/notifications/notify-next", () => ({ computeNotifyNextAt: async () => (calls.push("compute"), 777), earliestPendingAt: async () => pendingAt.value }));
vi.mock("@/lib/cron/run", () => ({ runCronJob: vi.fn() }));

import { POST } from "./route";

const req = (auth?: string) =>
  new Request("https://internal/api/cron/notifications?mode=tick", { method: "POST", headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  calls.length = 0;
  pendingAt.value = null;
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("notifications tick", () => {
  it("writes the next-work marker computed after the run", async () => {
    const res = await POST(req("Bearer s3cret"));
    expect(await res.json()).toEqual({ ok: true, retryAfterMs: null, summary: { materialized: 2, processed: 3 } });
    expect(calls).toEqual(["materialize", "drain", "compute", "next:777"]);
  });

  it("reports how long until a still-pending row is due, for the Queue retry", async () => {
    pendingAt.value = Date.now() + 120_000;
    const { retryAfterMs } = await (await POST(req("Bearer s3cret"))).json();
    expect(retryAfterMs).toBeGreaterThan(100_000);
    expect(retryAfterMs).toBeLessThanOrEqual(120_000);
  });

  it("touches no marker when unauthorized", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(calls).toEqual([]);
  });
});
