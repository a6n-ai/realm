import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@foundry/commons";

const adjust = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/services/wallet.service", () => ({ walletService: { adjust } }));
vi.mock("@/lib/services/session-service", () => ({ currentUserId: async () => 7n }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 42n }] }) }) }) },
}));

const { adjustCustomerCoinsAction } = await import("../wallet-actions");

describe("adjustCustomerCoinsAction", () => {
  it("adjusts the customer's wallet as the signed-in staff member", async () => {
    adjust.mockResolvedValue({ balance: 15 });
    expect(await adjustCustomerCoinsAction("usr_1", { coins: 5, memo: "Sorry" })).toEqual({});
    expect(adjust).toHaveBeenCalledWith({ userId: 42n, coins: 5, memo: "Sorry", actorId: 7n });
  });

  it("returns the validation message instead of throwing", async () => {
    adjust.mockRejectedValue(new ValidationError("That would take the balance below zero."));
    expect(await adjustCustomerCoinsAction("usr_1", { coins: -99, memo: "x" })).toEqual({
      error: "That would take the balance below zero.",
    });
  });
});
