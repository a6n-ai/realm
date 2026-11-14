import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, number>());
const revalidate = vi.hoisted(() => vi.fn());
const scheduleSiteRefreshWake = vi.hoisted(() => vi.fn());
const computeSiteNextAt = vi.hoisted(() => vi.fn(async (_n: number, _tz: string, _f: unknown) => 12345));
vi.mock("@/lib/runtime/workflow-wake", () => ({ scheduleSiteRefreshWake }));
vi.mock("@/lib/cache", () => ({
  sharedCache: () => ({
    get: async (k: string) => (store.has(k) ? { value: store.get(k) } : undefined),
    set: async (k: string, v: number) => void store.set(k, v),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("@foundry/cloud/background", () => ({ runInBackground: () => {} }));
vi.mock("@/lib/landing/site-boundaries", async (orig) => ({
  ...(await orig<typeof import("@/lib/landing/site-boundaries")>()),
  loadWindowEdges: async () => [],
  computeSiteNextAt,
}));
vi.mock("@/lib/settings", () => ({ getAppSettings: async () => ({ timezone: "America/Toronto" }) }));

import { runSiteRefresh } from "../site-refresh";

beforeEach(() => {
  store.clear();
  revalidate.mockReset();
  scheduleSiteRefreshWake.mockReset();
  computeSiteNextAt.mockClear();
});

describe("runSiteRefresh", () => {
  it("revalidates once per boundary", async () => {
    expect(await runSiteRefresh()).toEqual({ revalidated: true, followUp: false, nextAt: 12345 });
    expect(await runSiteRefresh()).toEqual({ revalidated: false, followUp: false, nextAt: 12345 });
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it("follows up once, 90 s after a revalidation was requested", async () => {
    await runSiteRefresh();
    revalidate.mockClear();
    store.set("requested-at", Date.now() - 80_000);
    expect((await runSiteRefresh()).followUp).toBe(false);
    expect(revalidate).not.toHaveBeenCalled();
    store.set("requested-at", Date.now() - 100_000);
    expect(await runSiteRefresh()).toEqual({ revalidated: false, followUp: true, nextAt: 12345 });
    expect((await runSiteRefresh()).followUp).toBe(false);
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it("schedules the next wake after a run, counting an owed follow-up", async () => {
    store.set("requested-at", 5000);
    await runSiteRefresh();
    expect(scheduleSiteRefreshWake).toHaveBeenCalledTimes(1);
    expect(scheduleSiteRefreshWake).toHaveBeenCalledWith(12345);
    expect(computeSiteNextAt).toHaveBeenLastCalledWith(expect.any(Number), "America/Toronto", { requestedAt: 5000, followedUp: 5000 });
  });
});
