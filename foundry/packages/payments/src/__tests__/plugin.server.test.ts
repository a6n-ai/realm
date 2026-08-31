import { describe, it, expect } from "vitest";
import { paymentsInstalledFrom, paymentsPlugin } from "../plugin.server";
import type { PaymentConfig } from "../config";

describe("paymentsInstalledFrom", () => {
  it("is true when the explicit flag is set", () => {
    expect(paymentsInstalledFrom({ installed: true }, { methods: [] })).toBe(true);
  });

  it("is false when the explicit flag is unset, even with methods present", () => {
    expect(
      paymentsInstalledFrom(
        { installed: false },
        { methods: [{ id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] }] },
      ),
    ).toBe(false);
  });

  it("backfills to true from existing methods when no flag was ever written", () => {
    expect(
      paymentsInstalledFrom(undefined, {
        methods: [{ id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] }],
      }),
    ).toBe(true);
  });

  it("backfills to false when there is neither a flag nor any method", () => {
    expect(paymentsInstalledFrom(undefined, { methods: [] })).toBe(false);
  });
});

function deps(integrations: Record<string, unknown> = {}, methods: PaymentConfig["methods"] = []) {
  let cfg = { ...integrations };
  return {
    store: {
      integrations: {
        get: async () => cfg,
        set: async (next: Record<string, unknown>) => {
          cfg = next;
        },
      },
      payments: { get: async () => ({ methods }) as PaymentConfig },
    },
    raw: () => cfg,
  };
}

describe("paymentsPlugin", () => {
  it("install sets the flag without clobbering another plugin's key", async () => {
    const d = deps({ clover: { installed: true } });
    await paymentsPlugin(d.store).install();
    expect(d.raw()).toEqual({ clover: { installed: true }, payments: { installed: true } });
  });

  it("uninstall clears the flag and leaves payment methods alone", async () => {
    const d = deps({ payments: { installed: true } }, [
      { id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] },
    ]);
    await paymentsPlugin(d.store).uninstall();
    expect(d.raw()).toEqual({ payments: { installed: false } });
    expect(await paymentsPlugin(d.store).status()).toEqual({ installed: false });
  });

  it("status counts providers when installed", async () => {
    const d = deps({ payments: { installed: true } }, [
      { id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] },
    ]);
    expect(await paymentsPlugin(d.store).status()).toEqual({
      installed: true,
      statusLabel: "Installed · 1 provider",
    });
  });
});
