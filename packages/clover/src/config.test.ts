import { describe, expect, it } from "vitest";
import { resolveIntegrationsConfig } from "./config";

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
});
