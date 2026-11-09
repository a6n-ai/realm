import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILD_PLACEHOLDER_SECRET, authSecret } from "../env";

describe("authSecret build placeholder", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets Better Auth load with the placeholder during next build", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", BUILD_PLACEHOLDER_SECRET);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(authSecret("auth")).toBe(BUILD_PLACEHOLDER_SECRET);
  });

  it("refuses to sign anything with the placeholder during next build", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", BUILD_PLACEHOLDER_SECRET);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    for (const purpose of ["receipt-link", "magic-link", "review-nudge"] as const) {
      expect(() => authSecret(purpose)).toThrow(/build placeholder/);
    }
  });

  it("refuses the placeholder at runtime, even for auth", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", BUILD_PLACEHOLDER_SECRET);
    vi.stubEnv("NEXT_PHASE", "");
    expect(() => authSecret("auth")).toThrow(/build placeholder/);
  });

  it("passes a real secret through", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "real-secret");
    expect(authSecret("receipt-link")).toBe("real-secret");
  });
});
