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
    expect(fetch).toHaveBeenCalledWith("https://internal/api/cron/notifications?mode=tick&wake=1", expect.objectContaining({ headers: { authorization: "Bearer s" } }));
  });

  it("SiteRefreshWake sleeps then calls the route", async () => {
    const { fetch, step } = await run("SiteRefreshWake", 1);
    expect(step.sleepUntil).toHaveBeenCalled();
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe("https://internal/api/cron/public-site");
  });

  it.each([
    ["CampaignWake", "CAMPAIGN_WAKE"],
    ["SiteRefreshWake", "SITE_REFRESH_WAKE"],
  ])("%s books a 15 min fallback wake when the route still fails after retries", async (cls, binding) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = (await import("./workflows.js")) as any;
    const create = vi.fn();
    const env = { WORKER_SELF_REFERENCE: { fetch: async () => new Response("x", { status: 500 }) }, CRON_SECRET: "s", [binding]: { create } };
    const step = { sleepUntil: vi.fn(), do: (_n: string, ...rest: any[]) => rest[rest.length - 1]() };
    const before = Date.now();
    await new mod[cls]({}, env).run({ payload: { at: 1 } }, step);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].params.at).toBeGreaterThanOrEqual(before + 15 * 60_000);
  });
});

describe("bootOnce", () => {
  const setup = (store: Map<string, string>, failGet = false) => {
    resetBootForTest();
    const wf = () => ({ create: vi.fn() });
    const CACHE = {
      get: vi.fn(async (k: string) => {
        if (failGet) throw new Error("kv down");
        return store.get(k) ?? null;
      }),
      put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    };
    const env = { SITE_REFRESH_WAKE: wf(), CAMPAIGN_WAKE: wf(), CACHE, CF_VERSION_METADATA: { id: "v1" } };
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
    return { env, ctx, waits, arm: vi.fn() };
  };

  it("creates wakes and arms the poller when the version key is absent, reading KV once per isolate", async () => {
    const store = new Map<string, string>();
    const t = setup(store);
    bootOnce(t.env, t.ctx, t.arm);
    bootOnce(t.env, t.ctx, t.arm);
    await Promise.all(t.waits);
    expect(t.env.CACHE.get).toHaveBeenCalledTimes(1);
    expect(store.has("wake-bootstrap:v1")).toBe(true);
    expect(t.env.SITE_REFRESH_WAKE.create).toHaveBeenCalledTimes(1);
    expect(t.env.CAMPAIGN_WAKE.create).toHaveBeenCalledTimes(1);
    expect(t.arm).toHaveBeenCalledTimes(1);
  });

  it("does nothing when this deployment already bootstrapped", async () => {
    const t = setup(new Map([["wake-bootstrap:v1", "1"]]));
    bootOnce(t.env, t.ctx, t.arm);
    await Promise.all(t.waits);
    expect(t.env.CAMPAIGN_WAKE.create).not.toHaveBeenCalled();
    expect(t.env.SITE_REFRESH_WAKE.create).not.toHaveBeenCalled();
    expect(t.arm).not.toHaveBeenCalled();
  });

  it("skips (and logs) when the KV read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup(new Map(), true);
    bootOnce(t.env, t.ctx, t.arm);
    await Promise.all(t.waits);
    expect(t.env.CAMPAIGN_WAKE.create).not.toHaveBeenCalled();
    expect(t.env.CACHE.put).not.toHaveBeenCalled();
  });
});
