import { beforeEach, describe, expect, it, vi } from "vitest";

let sessionCookie = false;
vi.mock("next/headers", () => ({
  cookies: async () => ({ has: (name: string) => sessionCookie && name === "better-auth.session_token" }),
}));

const { publicCached, clearPublicCache } = await import("../public-cache");

describe("publicCached", () => {
  beforeEach(() => {
    sessionCookie = false;
    clearPublicCache();
  });

  it("serves anonymous visitors from memory until cleared", async () => {
    const load = vi.fn(async () => "menu");
    await publicCached("eats:1", load);
    await publicCached("eats:1", load);
    expect(load).toHaveBeenCalledTimes(1);
    clearPublicCache();
    await publicCached("eats:1", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keys by org so franchises never share an entry", async () => {
    const load = vi.fn(async () => "x");
    await publicCached("eats:1", load);
    await publicCached("eats:2", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("always computes live for signed-in requests", async () => {
    sessionCookie = true;
    const load = vi.fn(async () => "x");
    await publicCached("eats:1", load);
    await publicCached("eats:1", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed load for the next visitor", async () => {
    await expect(publicCached("eats:1", async () => Promise.reject(new Error("db down")))).rejects.toThrow();
    await Promise.resolve();
    const load = vi.fn(async () => "ok");
    await expect(publicCached("eats:1", load)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
