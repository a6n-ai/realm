import { afterEach, describe, expect, it, vi } from "vitest";
import { isWorkers } from "./platform";

describe("isWorkers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is false under Node", () => {
    expect(isWorkers()).toBe(false);
  });

  it("is true when the Workers runtime identifies itself", () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    expect(isWorkers()).toBe(true);
  });
});
