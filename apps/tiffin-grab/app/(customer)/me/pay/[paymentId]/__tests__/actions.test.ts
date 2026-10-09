import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
const owned = vi.hoisted(() => ({ rows: [] as unknown[] }));
const payByCard = vi.fn();
const settle = vi.fn();
const abandon = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSession: async () => session.current }));
vi.mock("@/lib/payments/stripe", () => ({ appBaseUrl: () => "https://app.test" }));
vi.mock("@/lib/services/payment-stripe", () => ({
  payByCard: (...a: unknown[]) => payByCard(...a),
  settleStripePayment: (...a: unknown[]) => settle(...a),
  abandonCardAttempt: (...a: unknown[]) => abandon(...a),
}));
vi.mock("@/db/client", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "from", "innerJoin", "where"]) chain[k] = () => chain;
  chain.limit = async () => owned.rows;
  return { db: chain };
});

const { submitCardPayment, confirmReturn, abandonCard } = await import("../actions");

describe("pay page actions", () => {
  beforeEach(() => {
    session.current = null;
    owned.rows = [];
    payByCard.mockReset();
    settle.mockReset();
    abandon.mockReset();
  });

  it("refuse a signed-out caller without touching Stripe", async () => {
    expect("error" in (await submitCardPayment("pay_1", "ct", true))).toBe(true);
    expect("error" in (await abandonCard("pay_1"))).toBe(true);
    expect(await confirmReturn("pay_1")).toEqual({ ok: true, paid: false });
    expect(payByCard).not.toHaveBeenCalled();
    expect(abandon).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it("confirmReturn does not settle a payment the user does not own", async () => {
    session.current = { user: { id: "usr_a" } };
    expect(await confirmReturn("pay_1")).toEqual({ ok: true, paid: false });
    expect(settle).not.toHaveBeenCalled();
  });

  it("confirmReturn settles an owned payment", async () => {
    session.current = { user: { id: "usr_a" } };
    owned.rows = [{ id: 1n }];
    settle.mockResolvedValue("paid");
    expect(await confirmReturn("pay_1")).toEqual({ ok: true, paid: true });
  });

  it("passes the session user to payByCard and abandon (ownership enforced in the service)", async () => {
    session.current = { user: { id: "usr_a" } };
    payByCard.mockResolvedValue({ kind: "processing" });
    await submitCardPayment("pay_1", "ct", false);
    expect(payByCard.mock.calls[0]![0]).toMatchObject({ userPublicId: "usr_a", paymentPublicId: "pay_1" });
    await abandonCard("pay_1");
    expect(abandon).toHaveBeenCalledWith("pay_1", "usr_a");
  });
});
