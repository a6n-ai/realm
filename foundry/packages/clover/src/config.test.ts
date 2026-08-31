import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLOVER_CONNECTION,
  resolveIntegrationsConfig,
  resolveWebOrderTypeId,
  type CloverConnection,
} from "./config";

describe("resolveIntegrationsConfig", () => {
  it("uses the org's own config when it has a clover connection set", () => {
    const org = { integrationsConfig: { clover: { installed: true, connected: true, merchantId: "org-merchant" } } };
    const parent = { integrationsConfig: { clover: { installed: true, connected: true, merchantId: "brand-merchant" } } };
    const result = resolveIntegrationsConfig(org, parent);
    expect(result.clover?.merchantId).toBe("org-merchant");
  });

  it("falls back to the parent's config when the org's own is empty", () => {
    const org = { integrationsConfig: {} };
    const parent = { integrationsConfig: { clover: { installed: true, connected: true, merchantId: "brand-merchant" } } };
    const result = resolveIntegrationsConfig(org, parent);
    expect(result.clover?.merchantId).toBe("brand-merchant");
  });

  it("falls back to the parent's config when the org's own is null", () => {
    const org = { integrationsConfig: null };
    const parent = { integrationsConfig: { clover: { installed: true, connected: true, merchantId: "brand-merchant" } } };
    const result = resolveIntegrationsConfig(org, parent);
    expect(result.clover?.merchantId).toBe("brand-merchant");
  });

  it("returns the default empty config when neither org nor parent has one, with no parent", () => {
    const org = { integrationsConfig: null };
    const result = resolveIntegrationsConfig(org, null);
    expect(result).toEqual({});
  });

  it("returns the default empty config when neither org nor parent has one", () => {
    const org = { integrationsConfig: {} };
    const parent = { integrationsConfig: {} };
    const result = resolveIntegrationsConfig(org, parent);
    expect(result).toEqual({});
  });

  it("keeps the org's own non-clover keys even when it has no clover connection", () => {
    // Regression: the old implementation gated the WHOLE object on
    // own.clover, so an org (e.g. the brand) with only googleReviews
    // configured and no clover key of its own lost googleReviews entirely.
    const org = { integrationsConfig: { googleReviews: { installed: true, placeId: "abc" } } };
    const result = resolveIntegrationsConfig(org, null);
    expect(result.googleReviews).toEqual({ installed: true, placeId: "abc" });
  });

  it("a franchise's own clover fully replaces the parent's, other keys still fall back", () => {
    const org = { integrationsConfig: { clover: { installed: true, connected: true, merchantId: "franchise-merchant" } } };
    const parent = {
      integrationsConfig: {
        clover: { installed: true, connected: true, merchantId: "brand-merchant" },
        googleReviews: { installed: true, placeId: "brand-place" },
      },
    };
    const result = resolveIntegrationsConfig(org, parent);
    expect(result.clover?.merchantId).toBe("franchise-merchant");
    expect(result.googleReviews).toEqual({ installed: true, placeId: "brand-place" });
  });
});

describe("resolveWebOrderTypeId", () => {
  const conn = (webOrderTypes?: { pickup?: string; delivery?: string }) =>
    ({ ...DEFAULT_CLOVER_CONNECTION, webOrderTypes }) as CloverConnection;

  it("maps pickup and delivery to their configured types", () => {
    const c = conn({ pickup: "OT_PICK", delivery: "OT_DEL" });
    expect(resolveWebOrderTypeId(c, "pickup")).toBe("OT_PICK");
    expect(resolveWebOrderTypeId(c, "delivery_instant")).toBe("OT_DEL");
  });

  // Scheduled vs instant is our scheduling concern, not Register's — both tickets
  // should announce and print the same way.
  it("treats scheduled and instant delivery as the same type", () => {
    const c = conn({ delivery: "OT_DEL" });
    expect(resolveWebOrderTypeId(c, "delivery_scheduled")).toBe(
      resolveWebOrderTypeId(c, "delivery_instant"),
    );
  });

  // An unconfigured merchant must keep checking out, just untyped as before.
  it("returns undefined when unset, absent, or set only for the other fulfillment", () => {
    expect(resolveWebOrderTypeId(conn(), "pickup")).toBeUndefined();
    expect(resolveWebOrderTypeId(conn({}), "delivery_instant")).toBeUndefined();
    expect(resolveWebOrderTypeId(conn({ pickup: "OT_PICK" }), "delivery_instant")).toBeUndefined();
  });
});
