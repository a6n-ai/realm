import { describe, expect, it } from "vitest";
import { PUBLIC_API } from "../proxy";

/**
 * Anonymous checkout depends on these being reachable without a session. When
 * one is missing the symptom is silent — the address dropdown simply never
 * returns anything, with no error shown to the customer — which is how
 * /api/delivery/suggest shipped auth-gated and stayed unnoticed until it was
 * curled against production.
 */
describe("PUBLIC_API", () => {
  it.each([
    "/api/checkout",
    "/api/delivery/check-address",
    "/api/delivery/suggest",
  ])("keeps %s reachable without a session", (path) => {
    expect(PUBLIC_API).toContain(path);
  });
});
