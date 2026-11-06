import { describe, expect, it } from "vitest";
import { consentCardOn } from "../card-visible";

describe("consentCardOn", () => {
  it("asks on the public site, ordering included", () => {
    for (const p of ["/", "/refer", "/refer/QACUS7", "/menu", "/subscribe", "/subscribe/checkout", "/privacy"]) expect(consentCardOn(p)).toBe(true);
  });
  it("stays out of the signed-in app and the sign-in screens", () => {
    for (const p of ["/me", "/me/refer", "/dashboard", "/dashboard/orders/1", "/login", "/signup", "/forgot-password", "/set-password", "/verify-email", "/magic-link", "/accept-invitation/x", "/lock", "/no-access"]) expect(consentCardOn(p)).toBe(false);
  });
  it("does not mistake a public path that only starts with the same letters", () => {
    expect(consentCardOn("/menu-of-the-week")).toBe(true);
    expect(consentCardOn("/meals")).toBe(true);
  });
});
