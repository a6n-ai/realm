import { afterEach, describe, expect, it, vi } from "vitest";
import { purgeEdgePages } from "../edge-purge";

afterEach(() => vi.unstubAllEnvs());

describe("purgeEdgePages", () => {
  it("does nothing without a token", async () => {
    vi.stubEnv("CF_CACHE_PURGE_TOKEN", "");
    const fetcher = vi.fn();
    expect(await purgeEdgePages({ fetcher, delayMs: 0 })).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("purges every public apex page by URL", async () => {
    vi.stubEnv("CF_CACHE_PURGE_TOKEN", "tok");
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await purgeEdgePages({ fetcher: fetcher as unknown as typeof fetch, delayMs: 0 })).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/zones\/[0-9a-f]{32}\/purge_cache$/);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const files = JSON.parse(String(init.body)).files as string[];
    expect(files).toContain("https://tiffingrab.ca/");
    expect(files).toContain("https://tiffingrab.ca/menu");
  });

  it("throws on a refused purge so the background log shows it", async () => {
    vi.stubEnv("CF_CACHE_PURGE_TOKEN", "tok");
    const fetcher = vi.fn(async () => new Response("no", { status: 403 }));
    await expect(purgeEdgePages({ fetcher: fetcher as unknown as typeof fetch, delayMs: 0 })).rejects.toThrow("403");
  });
});
