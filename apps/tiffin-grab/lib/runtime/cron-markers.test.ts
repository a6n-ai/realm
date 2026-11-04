import { afterEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: { CACHE: { get: async (k: string) => kv.store.get(k) ?? null, put: async (k: string, v: string) => void kv.store.set(k, v) } },
  }),
}));

import { lowerNotifyNext, NOTIFY_NEXT_KEY } from "./cron-markers";

afterEach(() => {
  kv.store.clear();
  vi.unstubAllGlobals();
});

describe("lowerNotifyNext", () => {
  it("is a no-op on Node", async () => {
    await lowerNotifyNext(5);
    expect(kv.store.size).toBe(0);
  });

  it("pulls the marker forward only, and fills a missing one", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    await lowerNotifyNext(100);
    expect(kv.store.get(NOTIFY_NEXT_KEY)).toBe("100");
    await lowerNotifyNext(200);
    expect(kv.store.get(NOTIFY_NEXT_KEY)).toBe("100");
    await lowerNotifyNext(50);
    expect(kv.store.get(NOTIFY_NEXT_KEY)).toBe("50");
  });
});
