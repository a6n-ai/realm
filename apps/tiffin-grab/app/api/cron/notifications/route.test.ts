import { beforeEach, describe, expect, it, vi } from "vitest";

const tick = vi.hoisted(() => vi.fn());
const runCronJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/tick", () => ({ runTick: tick }));
vi.mock("@/lib/cron/run", () => ({ runCronJob }));

import { POST } from "./route";

const req = (qs: string, auth?: string) =>
  new Request(`https://internal/api/cron/notifications${qs}`, { method: "POST", headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("notifications route", () => {
  it("queue tick returns retryAfterMs for the consumer and records no cron run", async () => {
    tick.mockResolvedValue({ materialized: 2, processed: 3, retryAfterMs: 5000 });
    expect(await (await POST(req("?mode=tick", "Bearer s3cret"))).json()).toEqual({ ok: true, retryAfterMs: 5000, summary: { materialized: 2, processed: 3 } });
    expect(runCronJob).not.toHaveBeenCalled();
  });

  it("the Workflow tick (wake=1) is recorded as campaign-wake and 500s on failure so the step retries", async () => {
    runCronJob.mockResolvedValue({ ok: false, error: "db down" });
    const res = await POST(req("?mode=tick&wake=1", "Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(runCronJob).toHaveBeenCalledWith("campaign-wake", "schedule");
  });

  it("401s without the bearer", async () => {
    expect((await POST(req("?mode=tick"))).status).toBe(401);
    expect(tick).not.toHaveBeenCalled();
  });
});
