/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWake, wakeId } from "./wake.js";
import { bootOnce, resetBootForTest } from "./bootstrap.js";

vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: class { env: unknown; constructor(_c: unknown, env: unknown) { this.env = env; } } }));

afterEach(() => vi.restoreAllMocks());

describe("createWake", () => {
  it("creates an instance with a minute-rounded id", async () => {
    const create = vi.fn();
    await createWake({ create }, "wake", 120_001);
    expect(wakeId("wake", 120_001)).toBe("wake-180000");
    expect(create).toHaveBeenCalledWith({ id: "wake-180000", params: { at: 120_001 } });
  });
  it("swallows a duplicate id silently", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await createWake({ create: async () => { throw new Error("instance.already_exists"); } }, "site", 1);
    expect(err).not.toHaveBeenCalled();
  });
  it("logs other errors without throwing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await createWake({ create: async () => { throw new Error("boom"); } }, "site", 1);
    expect(err).toHaveBeenCalled();
  });
});

describe("workflows", () => {
  const run = async (cls: "CampaignWake" | "SiteRefreshWake", at: number) => {
    const mod = (await import("./workflows.js")) as any;
    const fetch = vi.fn(async () => new Response("{}"));
    const steps: string[] = [];
    const step = {
      sleepUntil: vi.fn(async (n: string) => void steps.push(n)),
      do: vi.fn(async (n: string, _o: unknown, fn: () => Promise<void>) => (steps.push(n), fn())),
    };
    const w = new mod[cls]({}, { WORKER_SELF_REFERENCE: { fetch }, CRON_SECRET: "s" });
    await w.run({ payload: { at } }, step);
    return { fetch, step, steps };
  };

  it("CampaignWake sleeps until `at` then calls the tick", async () => {
    const at = Date.now() + 60_000;
    const { fetch, step, steps } = await run("CampaignWake", at);
    expect(step.sleepUntil).toHaveBeenCalledWith("wait", new Date(at));
    expect(steps).toEqual(["wait", "run"]);
    expect(fetch).toHaveBeenCalledWith("https://internal/api/cron/notifications?mode=tick", expect.objectContaining({ headers: { authorization: "Bearer s" } }));
  });

  it("SiteRefreshWake skips the sleep when `at` is past and calls the route", async () => {
    const { fetch, step } = await run("SiteRefreshWake", 1);
    expect(step.sleepUntil).not.toHaveBeenCalled();
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe("https://internal/api/cron/public-site");
  });

  it("fails the step on a non-2xx so the Workflow retries", async () => {
    const mod = (await import("./workflows.js")) as any;
    const w = new mod.SiteRefreshWake({}, { WORKER_SELF_REFERENCE: { fetch: async () => new Response("x", { status: 500 }) }, CRON_SECRET: "s" });
    await expect(w.run({ payload: { at: 1 } }, { sleepUntil: vi.fn(), do: (_n: string, _o: unknown, fn: () => Promise<void>) => fn() })).rejects.toThrow("500");
  });
});

describe("bootOnce", () => {
  it("schedules both wakes and arms the poller once per isolate", async () => {
    resetBootForTest();
    const wf = () => ({ create: vi.fn() });
    const env = { SITE_REFRESH_WAKE: wf(), CAMPAIGN_WAKE: wf() };
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
    const arm = vi.fn();
    bootOnce(env, ctx, arm);
    bootOnce(env, ctx, arm);
    await Promise.all(waits);
    expect(waits).toHaveLength(1);
    expect(env.SITE_REFRESH_WAKE.create).toHaveBeenCalledTimes(1);
    expect(env.CAMPAIGN_WAKE.create).toHaveBeenCalledTimes(1);
    expect(arm).toHaveBeenCalledTimes(1);
  });
});
