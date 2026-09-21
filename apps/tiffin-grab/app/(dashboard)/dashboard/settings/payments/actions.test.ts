import { describe, expect, it, vi } from "vitest";
import { paymentConfigSaveError } from "@foundry/payments";

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/services/app-settings.service", () => ({
  getPaymentConfig: vi.fn(),
  setPaymentConfig: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { savePaymentConfig } from "./actions";

// Thrown errors are redacted to "Minified React error #441" in production, so an
// expected rule violation must come back as a value the form can show.
describe("savePaymentConfig", () => {
  it("returns an error, not a throw, when an enabled e-transfer has no payee handle", async () => {
    const res = await savePaymentConfig({
      methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", taxes: [] }],
    });
    expect(res).toEqual({ error: expect.stringContaining("payee handle") });
  });

  it("allows enabling cash without a payee handle", async () => {
    const res = await savePaymentConfig({
      methods: [{ id: "cash", kind: "manual", enabled: true, label: "Cash on delivery", taxes: [] }],
    });
    expect(res).toEqual({ ok: true });
  });
});

describe("paymentConfigSaveError (from @foundry/payments)", () => {
  it("requires a payee handle only for enabled e-Transfer", () => {
    expect(
      paymentConfigSaveError({
        methods: [{ id: "cash", kind: "manual", enabled: true, label: "Cash", taxes: [] }],
      }),
    ).toBeNull();
    expect(
      paymentConfigSaveError({
        methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", taxes: [] }],
      }),
    ).toMatch(/payee handle/);
  });
});
