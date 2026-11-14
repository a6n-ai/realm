import { beforeEach, describe, expect, it, vi } from "vitest";

const pollOnce = vi.hoisted(() => vi.fn());
const runCronJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cron/run", () => ({ runCronJob }));

import { POST } from "./route";

const req = (auth?: string) =>
  new Request("https://internal/api/cron/optimo-events", { method: "POST", headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  pollOnce.mockReset();
  runCronJob.mockReset();
  runCronJob.mockImplementation(async () => {
    try {
      return { ok: true, summary: await pollOnce() };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("optimo-events cron", () => {
  it("401s without the bearer and never polls", async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer nope"))).status).toBe(401);
    expect(pollOnce).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(req("Bearer "))).status).toBe(401);
    expect(pollOnce).not.toHaveBeenCalled();
  });

  it("polls once with the bearer and returns the result", async () => {
    pollOnce.mockResolvedValue({ applied: 2, ignored: 1 });
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: { applied: 2, ignored: 1 } });
    expect(pollOnce).toHaveBeenCalledTimes(1);
    expect(runCronJob).toHaveBeenCalledWith("optimo-events", "schedule");
  });

  it("500s when the poll throws", async () => {
    pollOnce.mockRejectedValue(new Error("boom"));
    expect((await POST(req("Bearer s3cret"))).status).toBe(500);
  });
});
