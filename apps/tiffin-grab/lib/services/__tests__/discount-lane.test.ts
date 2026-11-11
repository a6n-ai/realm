import { describe, expect, it, vi } from "vitest";
import { round2 } from "@foundry/commons/util/money";

const coupon = (code: string, kind = "percentage", autoApply = false) => ({ code, name: code, kind, autoApply });
const { resolve, validateRep } = vi.hoisted(() => ({ resolve: vi.fn(), validateRep: vi.fn() }));
vi.mock("@/lib/services/coupons.service", () => ({ couponsService: { resolveBestCoupons: resolve, validateRepCoupon: validateRep } }));

import { applyDiscountLane } from "../discount-lane";
import { coinLimits, quoteCoinCap } from "@/lib/pricing/coin-cap";

// Pre-refactor lanes, verbatim in behavior: createOrder (create-order.ts) and the inquiries order preview.
async function oldCreate(postCatalog: number, rep: { code: string; amount: number } | null) {
  const best = await resolve();
  const adjustments: { label: string; amount: number }[] = [];
  const remainingAfter = () => Math.max(0, round2(postCatalog - adjustments.reduce((s, a) => s + a.amount, 0)));
  for (const r of best.redemptions) {
    const amount = Math.min(r.amount, remainingAfter());
    if (amount <= 0) continue;
    adjustments.push({ label: `${r.coupon.name} (${r.coupon.code})`, amount });
  }
  if (rep) {
    const line = await validateRep(rep.code, { subtotal: remainingAfter() });
    if (line.amount > 0) adjustments.push(line);
  }
  return adjustments;
}
const oldPreviewCoins = (postCatalog: number, remaining: number, balance: number, rate: number, maxPct: number | null, maxRedeem: number | null, coins: number | "max") => {
  const cap = quoteCoinCap({ subtotal: postCatalog, remaining, balance, rate, maxPct, maxRedeemPctOfBalance: maxRedeem });
  const pctCap = maxPct == null ? Infinity : round2(postCatalog * (maxPct / 100));
  const walletPctCap = maxRedeem == null ? Infinity : Math.floor(balance * (maxRedeem / 100));
  return { want: Math.max(0, Math.min(coins === "max" ? cap.maxCoins : Math.floor(coins), cap.maxCoins)), pctCap, walletPctCap };
};

const best = (redemptions: { coupon: ReturnType<typeof coupon>; amount: number }[]) => ({ lines: [], redemptions, manualErrors: [], notApplied: [] });

describe("discount lane equals the old createOrder and preview lanes", () => {
  const cases: [string, number, ReturnType<typeof best>, { code: string; amount: number } | null][] = [
    ["coupon only", 200, best([{ coupon: coupon("A"), amount: 20 }]), null],
    ["two coupons, second clamped to what is left", 30, best([{ coupon: coupon("A"), amount: 25 }, { coupon: coupon("B"), amount: 25 }]), null],
    ["rep only", 150, best([]), { code: "REP", amount: 15 }],
    ["coupon then rep", 100, best([{ coupon: coupon("A"), amount: 40 }]), { code: "REP", amount: 12.5 }],
  ];
  for (const [name, postCatalog, b, rep] of cases) {
    it(name, async () => {
      resolve.mockResolvedValue(b);
      validateRep.mockImplementation(async (code: string, ctx: { subtotal: number }) => ({ label: code, amount: Math.min(rep?.amount ?? 0, ctx.subtotal) }));
      const old = await oldCreate(postCatalog, rep);
      const lane = await applyDiscountLane({
        postCatalog, userId: 1n, paymentMethodId: "stripe",
        rep: rep ? { code: rep.code, requestedAmount: rep.amount, actorId: 9n } : undefined, strict: true,
      });
      const preview = await applyDiscountLane({
        postCatalog, userId: 1n, paymentMethodId: "stripe",
        rep: rep ? { code: rep.code, requestedAmount: rep.amount, actorId: 9n } : undefined, strict: false,
      });
      expect(lane.lines).toEqual(old);
      expect(preview.lines).toEqual(old);
    });
  }

  it("strict rejects what the preview reports", async () => {
    resolve.mockResolvedValue(best([{ coupon: coupon("S", "rep_code"), amount: 5 }]));
    const args = { postCatalog: 100, userId: null, paymentMethodId: null, rep: { code: "REP", requestedAmount: 5, actorId: 9n } };
    await expect(applyDiscountLane({ ...args, strict: true })).rejects.toThrow("Only one staff discount");
    expect((await applyDiscountLane({ ...args, strict: false })).error).toMatch("Only one staff discount");
    resolve.mockResolvedValue(best([]));
    await expect(applyDiscountLane({ ...args, rep: { ...args.rep, actorId: null }, strict: true })).rejects.toThrow("acting staff");
    expect((await applyDiscountLane({ ...args, rep: { ...args.rep, actorId: null }, strict: false })).lines).toEqual([]);
  });

  it("refuses staff coupons that would sell below cost, keeps auto ones", async () => {
    const auto = { coupon: { ...coupon("AUTO"), autoApply: true }, amount: 10 };
    const staff = { coupon: { ...coupon("STAFF", "fixed"), autoApply: false }, amount: 50 };
    resolve.mockResolvedValue(best([auto, staff]));
    const preview = await applyDiscountLane({
      postCatalog: 100, userId: 1n, paymentMethodId: "stripe", costFloor: 70, strict: false,
    });
    expect(preview.applied.map((a) => a.coupon.code)).toEqual(["AUTO"]);
    expect(preview.best.manualErrors).toContainEqual({ code: "STAFF", error: "This discount would sell below cost" });
    resolve.mockResolvedValue(best([auto, staff]));
    await expect(applyDiscountLane({
      postCatalog: 100, userId: 1n, paymentMethodId: "stripe", costFloor: 70, strict: true,
    })).rejects.toThrow(/below cost/);
  });

  it("refuses a rep discount that would sell below cost", async () => {
    resolve.mockResolvedValue(best([]));
    validateRep.mockResolvedValue({ label: "REP", amount: 40 });
    const preview = await applyDiscountLane({
      postCatalog: 100, userId: 1n, paymentMethodId: "stripe",
      rep: { code: "REP", requestedAmount: 40, actorId: 9n }, costFloor: 70, strict: false,
    });
    expect(preview.rep).toBeNull();
    expect(preview.error).toMatch(/below cost/);
    resolve.mockResolvedValue(best([]));
    await expect(applyDiscountLane({
      postCatalog: 100, userId: 1n, paymentMethodId: "stripe",
      rep: { code: "REP", requestedAmount: 40, actorId: 9n }, costFloor: 70, strict: true,
    })).rejects.toThrow(/below cost/);
  });

  const coinCases: [string, number, number, number, number, number | null, number | null, number | "max"][] = [
    ["capped by pct", 100, 100, 5000, 0.01, 30, null, "max"],
    ["capped by wallet share", 100, 100, 1000, 0.01, null, 20, "max"],
    ["capped by subtotal", 100, 40, 9000, 0.01, 90, null, 5000],
  ];
  for (const [name, postCatalog, remaining, balance, rate, maxPct, maxRedeem, coins] of coinCases) {
    it(`coin limits ${name}`, () => {
      const old = oldPreviewCoins(postCatalog, remaining, balance, rate, maxPct, maxRedeem, coins);
      const { pctCap, walletPctCap } = coinLimits({ subtotal: postCatalog, balance, maxPct, maxRedeemPctOfBalance: maxRedeem });
      expect({ pctCap, walletPctCap }).toEqual({ pctCap: old.pctCap, walletPctCap: old.walletPctCap });
    });
  }
});
