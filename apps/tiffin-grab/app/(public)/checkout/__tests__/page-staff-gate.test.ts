import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { role: string } } }));
const userId = vi.hoisted(() => ({ current: null as bigint | null }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session.current }));
vi.mock("@/lib/services/session-service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/session-service")>()),
  currentUserId: async () => userId.current,
}));
vi.mock("@/lib/services/app-settings.service", () => ({ getAppSettings: async () => ({ defaultCountry: "CA" }) }));

const { default: CheckoutPage } = await import("../page");

describe("checkout page gate", () => {
  beforeEach(() => {
    session.current = null;
    userId.current = null;
  });

  it("sends a signed-in staff account (e.g. an invitee with no password yet) to /dashboard", async () => {
    session.current = { user: { role: "member" } };
    userId.current = 1n;
    await expect(CheckoutPage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("still sends a signed-out visitor to /subscribe", async () => {
    await expect(CheckoutPage()).rejects.toThrow("REDIRECT:/subscribe");
  });
});
