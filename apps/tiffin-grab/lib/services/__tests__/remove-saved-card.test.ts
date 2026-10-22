import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));
const detach = vi.fn();
const cards = vi.fn();
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({ stripe: { paymentMethods: { detach: (...a: unknown[]) => detach(...a) } }, cfg: {} }),
  customerStore: { get: async () => "cus_1" },
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({ ...(await orig<object>()), listCards: (...a: unknown[]) => cards(...a) }));

const { removeSavedCard } = await import("../payment-stripe");

describe("removeSavedCard", () => {
  beforeEach(() => {
    detach.mockReset();
    cards.mockReset().mockResolvedValue([{ paymentMethodId: "pm_mine" }]);
  });

  it("detaches an owned card", async () => {
    await removeSavedCard("usr_1", "pm_mine");
    expect(detach).toHaveBeenCalledWith("pm_mine");
  });

  it("rejects a card that is not the user's and detaches nothing", async () => {
    await expect(removeSavedCard("usr_1", "pm_foreign")).rejects.toThrow("not available");
    expect(detach).not.toHaveBeenCalled();
  });
});
