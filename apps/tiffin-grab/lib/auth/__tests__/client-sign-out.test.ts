// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const authSignOut = vi.fn(async () => ({ data: null, error: null }));
vi.mock("better-auth/react", () => ({ createAuthClient: () => ({ signOut: authSignOut }) }));
vi.mock("better-auth/client/plugins", () => ({ emailOTPClient: () => ({}) }));

const { signOut } = await import("../client");

describe("signOut", () => {
  it("drops this tab's plan draft so the next sign-in starts clean", async () => {
    sessionStorage.setItem("tiffin.wizard", "{}");
    sessionStorage.setItem("tiffin.wizard.step", "3");
    sessionStorage.setItem("tiffin.wizard.origin", "renew");
    sessionStorage.setItem("other.key", "kept");

    await signOut();

    expect(authSignOut).toHaveBeenCalled();
    expect(Object.keys(sessionStorage)).toEqual(["other.key"]);
  });
});
