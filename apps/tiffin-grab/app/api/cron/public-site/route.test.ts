import { beforeEach, describe, expect, it, vi } from "vitest";

const runCronJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cron/run", () => ({ runCronJob }));

import { POST } from "./route";

const req = (auth?: string) =>
  new Request("https://internal/api/cron/public-site", { method: "POST", headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  runCronJob.mockReset();
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("public-site route", () => {
  it("401s without bearer", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(runCronJob).not.toHaveBeenCalled();
  });
  it("runs site-refresh recorded in cron_runs and returns nextAt", async () => {
    runCronJob.mockResolvedValue({ ok: true, summary: { revalidated: "yes", followUp: "no", nextAt: 99 } });
    expect(await (await POST(req("Bearer s3cret"))).json()).toEqual({ ok: true, revalidated: "yes", followUp: "no", nextAt: 99 });
    expect(runCronJob).toHaveBeenCalledWith("site-refresh", "schedule");
  });
  it("500s on failure so the Workflow step retries", async () => {
    runCronJob.mockResolvedValue({ ok: false, error: "x" });
    expect((await POST(req("Bearer s3cret"))).status).toBe(500);
  });
});
