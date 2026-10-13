import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const completeFinishedOrders = vi.fn(async () => ({ checked: 3, completed: 1 }));
vi.mock("@/lib/services/deliveries.service", async (importOriginal) => ({ ...(await importOriginal<object>()), completeFinishedOrders }));
vi.mock("@/lib/services/pause-days.service", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  lapseAllElapsedPauses: async () => { throw new Error("db down for pauses"); },
}));

const { runCronJob } = await import("../run");

describe("complete-plans", () => {
  it("still closes finished plans when the paused-day conversion throws", async () => {
    const run = await runCronJob("complete-plans", "manual");
    expect(run).toMatchObject({ ok: true, summary: { lapseFailed: "all", checked: 3, completed: 1 } });
    expect(completeFinishedOrders).toHaveBeenCalledTimes(1);
  });
});
