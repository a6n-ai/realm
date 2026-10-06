import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/services/session-service", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/auth/security-events", () => ({}));

const { signInPath } = await import("@/lib/auth");

describe("signInPath", () => {
  it("names the provider on the shared OAuth callback route", () => {
    // Better Auth reports the route pattern, not the URL: Google sign-ins were unaudited until this.
    expect(signInPath("/callback/:id", { id: "google" })).toBe("/callback/google");
  });

  it("leaves every other path alone", () => {
    expect(signInPath("/one-tap/callback")).toBe("/one-tap/callback");
    expect(signInPath("/sign-in/email-otp")).toBe("/sign-in/email-otp");
  });
});
