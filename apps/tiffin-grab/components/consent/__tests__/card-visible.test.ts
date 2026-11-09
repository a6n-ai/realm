import { describe, expect, it } from "vitest";
import { consentCardOn } from "../card-visible";

describe("consentCardOn", () => {
  it("asks on the public site, but not while ordering", () => {
    for (const p of ["/", "/refer", "/refer/QACUS7", "/menu", "/privacy"]) expect(consentCardOn(p)).toBe(true);
    for (const p of ["/subscribe", "/subscribe/checkout", "/checkout"]) expect(consentCardOn(p)).toBe(false);
  });
  it("stays out of the signed-in app and the sign-in screens", () => {
    for (const p of ["/me", "/me/refer", "/dashboard", "/dashboard/orders/1", "/login", "/signup", "/forgot-password", "/set-password", "/verify-email", "/magic-link", "/accept-invitation/x", "/lock", "/no-access"]) expect(consentCardOn(p)).toBe(false);
  });
  it("does not mistake a public path that only starts with the same letters", () => {
    expect(consentCardOn("/menu-of-the-week")).toBe(true);
    expect(consentCardOn("/meals")).toBe(true);
  });
});

describe("order flow", () => {
  it("never asks while someone is ordering", async () => {
    const { consentCardOn, inOrderFlow } = await import("../card-visible");
    for (const p of ["/subscribe", "/checkout", "/me/renew", "/me/trial", "/activate/abc"]) {
      expect(inOrderFlow(p)).toBe(true);
      expect(consentCardOn(p)).toBe(false);
    }
    expect(inOrderFlow("/menu")).toBe(false);
    expect(consentCardOn("/menu")).toBe(true);
  });
});
