import { describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));

const { DATA_BUILD_ID, buildIdFor, r2CacheKeepingData } = await import("./data-cache");

const keyOf = (cacheType: string) =>
  (r2CacheKeepingData as unknown as { getR2Key(k: string, t: string): string }).getR2Key("k", cacheType);

describe("data-cache keys", () => {
  it("keys fetch data without the build id, so it survives deploys", () => {
    expect(buildIdFor("fetch", "build-1")).toBe(DATA_BUILD_ID);
    process.env.OPEN_NEXT_BUILD_ID = "build-1";
    const before = keyOf("fetch");
    process.env.OPEN_NEXT_BUILD_ID = "build-2";
    expect(keyOf("fetch")).toBe(before);
  });

  it("keeps pages and use-cache entries per build", () => {
    expect(buildIdFor("cache", "build-1")).toBe("build-1");
    expect(buildIdFor("composable", "build-1")).toBe("build-1");
    process.env.OPEN_NEXT_BUILD_ID = "build-1";
    const before = keyOf("cache");
    process.env.OPEN_NEXT_BUILD_ID = "build-2";
    expect(keyOf("cache")).not.toBe(before);
  });
});
