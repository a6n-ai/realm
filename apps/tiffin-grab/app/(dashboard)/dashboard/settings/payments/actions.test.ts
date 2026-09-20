import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/services/app-settings.service", () => ({
  getPaymentConfig: vi.fn(),
  setPaymentConfig: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { savePaymentConfig } from "./actions";

// Thrown errors are redacted to "Minified React error #441" in production, so an expected
// rule violation must come back as a value the form can show.
describe("savePaymentConfig", () => {
  it("returns an error, not a throw, when an enabled e-transfer has no payee handle", async () => {
    const res = await savePaymentConfig({
      methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", taxes: [] }],
    });
    expect(res).toEqual({ error: expect.stringContaining("payee handle") });
  });
});
