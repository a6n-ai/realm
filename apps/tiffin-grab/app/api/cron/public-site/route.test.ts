import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, number>());
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cache", () => ({
  sharedCache: () => ({
    get: async (k: string) => (store.has(k) ? { value: store.get(k) } : undefined),
    set: async (k: string, v: number) => void store.set(k, v),
  }),
}));
vi.mock("@/lib/landing/revalidate-site", () => ({ revalidatePublicSite: revalidate }));
vi.mock("@/lib/landing/site-boundaries", async (orig) => ({
  ...(await orig<typeof import("@/lib/landing/site-boundaries")>()),
  loadWindowEdges: async () => [],
}));
vi.mock("@/lib/services/app-settings.service", () => ({ getAppSettings: async () => ({ timezone: "America/Toronto" }) }));

import { POST } from "./route";

const req = (auth?: string) =>
  new Request("https://internal/api/cron/public-site", { method: "POST", headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  store.clear();
  revalidate.mockReset();
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("public-site cron", () => {
  it("401s without bearer", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("revalidates once per boundary", async () => {
    expect(await (await POST(req("Bearer s3cret"))).json()).toEqual({ ok: true, revalidated: true });
    expect(await (await POST(req("Bearer s3cret"))).json()).toEqual({ ok: true, revalidated: false });
    expect(revalidate).toHaveBeenCalledTimes(1);
  });
});
