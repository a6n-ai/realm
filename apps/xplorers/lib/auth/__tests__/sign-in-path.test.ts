import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/services/session-service", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/auth/security-events", () => ({}));

const { signInPath } = await import("@/lib/auth");

describe("signInPath", () => {
  it("names the provider on the shared OAuth callback route, so Google sign-ins are audited", () => {
    expect(signInPath("/callback/:id", { id: "google" })).toBe("/callback/google");
    expect(signInPath("/one-tap/callback")).toBe("/one-tap/callback");
    expect(signInPath("/sign-in/email-otp")).toBe("/sign-in/email-otp");
  });
});
