import { afterEach, describe, expect, it, vi } from "vitest";
import { realtimeConfig } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("realtimeConfig", () => {
  it("realtimeConfig returns null for a short secret", () => {
    vi.stubEnv("REALTIME_URL", "https://rt.example");
    vi.stubEnv("REALTIME_SECRET", "short");
    expect(realtimeConfig()).toBeNull();
  });

  it("realtimeConfig returns url and secret when both valid", () => {
    vi.stubEnv("REALTIME_URL", "https://rt.example");
    vi.stubEnv("REALTIME_SECRET", "s".repeat(32));
    expect(realtimeConfig()).toEqual({ url: "https://rt.example", secret: "s".repeat(32) });
  });
});
