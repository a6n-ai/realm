import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth/guards", () => ({ requirePermission: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/services/session-service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/session-service")>()),
  currentUserId: async () => 7n,
}));
const setCalls = vi.hoisted(() => [] as unknown[]);
vi.mock("@/db/client", () => ({
  db: {
    update: () => ({ set: (v: unknown) => ({ where: async () => void setCalls.push(v) }) }),
    insert: () => ({ values: async (v: unknown) => void setCalls.push(v) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 42n }] }) }) }),
  },
}));
const adjust = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/wallet.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/wallet.service")>()),
  walletService: { adjust, balance: async () => 0, familyUserId: async () => 42n },
}));

vi.mock("@/lib/services/app-settings.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/app-settings.service")>()),
  getAppClock: async () => ({ timezone: "America/Toronto", currency: "SGD" }),
}));

const { adjustFamilyCoinsAction, saveCoinRateAction, savePayoutAction } = await import("../actions");

describe("wallet admin actions", () => {
  it("saves a payout for a known event", async () => {
    await savePayoutAction({ event: "first_booking", enabled: true, coins: 20 });
    expect(setCalls.at(-1)).toEqual({ enabled: true, coins: 20, updatedBy: 7n });
  });

  it("refuses staff grants and unknown events as payouts", async () => {
    await expect(savePayoutAction({ event: "manual_adjustment", enabled: true, coins: 1 })).rejects.toThrow(ValidationError);
    await expect(savePayoutAction({ event: "nope", enabled: true, coins: 1 })).rejects.toThrow(ValidationError);
    await expect(savePayoutAction({ event: "signup", enabled: true, coins: 1 })).rejects.toThrow(ValidationError);
    await expect(savePayoutAction({ event: "first_booking", enabled: true, coins: -1 })).rejects.toThrow(ValidationError);
  });

  it("saves the coin rate in the app currency only, stamped with the staff member", async () => {
    await expect(saveCoinRateAction({ currency: "CAD", valuePerCoin: 0.1 })).rejects.toThrow(ValidationError);
    await saveCoinRateAction({ currency: "SGD", valuePerCoin: 0.1 });
    expect(setCalls.at(-1)).toEqual({ currency: "SGD", valuePerCoin: "0.1000", createdBy: 7n });
  });

  it("returns the message when an adjustment is refused", async () => {
    adjust.mockRejectedValue(new ValidationError("That would take the balance below zero."));
    expect(await adjustFamilyCoinsAction("usr_x", { coins: -5, memo: "x" })).toEqual({
      error: "That would take the balance below zero.",
    });
    adjust.mockResolvedValue({ balance: 5 });
    expect(await adjustFamilyCoinsAction("usr_x", { coins: 5, memo: "Raffle" })).toEqual({});
    expect(adjust).toHaveBeenLastCalledWith({ userId: 42n, coins: 5, memo: "Raffle", actorId: 7n });
  });
});
