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
  walletService: { adjust, balance: async () => 0 },
}));

const { adjustFamilyCoinsAction, savePayoutAction } = await import("../actions");

describe("wallet admin actions", () => {
  it("saves a payout for a known event", async () => {
    await savePayoutAction({ event: "signup", enabled: true, coins: 20 });
    expect(setCalls.at(-1)).toEqual({ enabled: true, coins: 20 });
  });

  it("refuses staff grants and unknown events as payouts", async () => {
    await expect(savePayoutAction({ event: "manual_adjustment", enabled: true, coins: 1 })).rejects.toThrow(ValidationError);
    await expect(savePayoutAction({ event: "nope", enabled: true, coins: 1 })).rejects.toThrow(ValidationError);
    await expect(savePayoutAction({ event: "signup", enabled: true, coins: -1 })).rejects.toThrow(ValidationError);
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
