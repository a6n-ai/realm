// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { Checkout } from "../checkout";
import { enterAddress } from "./address-helper";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const mockRouter = { push: vi.fn(), replace: vi.fn() };
let routerNow: typeof mockRouter = mockRouter;
vi.mock("next/navigation", () => ({ useRouter: () => routerNow }));

const payCheckout = vi.fn();
const confirmSubscription = vi.fn();
vi.mock("@/app/(public)/checkout/actions", () => ({
  confirmSubscription: (...a: unknown[]) => confirmSubscription(...a),
  payCheckout: (...a: unknown[]) => payCheckout(...a),
}));
vi.mock("@/app/(customer)/me/pay/[paymentId]/actions", () => ({
  confirmReturn: vi.fn(),
  abandonCard: vi.fn(),
  newCustomerSession: vi.fn(),
}));

const warm = vi.hoisted(() => vi.fn());
const hoistedReceipt = vi.hoisted(() => ({ fn: null as null | ((i: { paidWith: string | null; totalCents: number | null; feeCents: number }) => { receipt: Record<string, unknown>; secondary?: unknown }) }));
const etransferProps = vi.hoisted(() => ({ value: null as null | { open: boolean; payment: Record<string, unknown>; renderSubmitted: () => ReactNode; onClosedWithoutProof?: () => void; onOpenChange: (o: boolean) => void } }));
vi.mock("@/components/payments/etransfer-dialog", () => ({
  EtransferDialog: (p: NonNullable<typeof etransferProps.value>) => {
    etransferProps.value = p;
    return p.open ? <div data-testid="etransfer-dialog">{p.renderSubmitted()}</div> : null;
  },
}));
const lastCtx = vi.hoisted(() => ({ value: null as CardCheckoutContext | null }));
// The real pieces need Stripe.js; these stand-ins call the same props the real ones do.
vi.mock("@/components/payments/pay-panel", () => {
  type P = {
    onPay: (s: { savedPaymentMethodId: string } | { confirmationTokenId: string }, accept: boolean) => Promise<{ kind: string }>;
    onPaid: () => void;
    onProcessing: () => void;
    receipt: (i: { paidWith: string | null; totalCents: number | null; feeCents: number }) => { receipt: Record<string, unknown>; secondary?: unknown };
    disabled?: boolean;
    children: ReactNode;
  };
  let current: P;
  const receiptOf = hoistedReceipt;
  return {
    PaidSwitch: ({ children }: { children: ReactNode }) => <>{children}</>,
    CardPayProvider: (p: P) => { current = p; receiptOf.fn = p.receipt; lastCtx.value = (p as unknown as { ctx: CardCheckoutContext }).ctx; return <div data-testid="provider">{p.children}</div>; },
    ExpressPay: () => <div data-testid="express" />,
    useWarmStripe: (key: string | null | undefined) => warm(key),
    LastUsedCard: ({ onSelect }: { onSelect?: () => void }) => {
      const first = (current as unknown as { ctx: CardCheckoutContext }).ctx.savedCards[0];
      return first ? (
        <button type="button" onClick={async () => {
          if (onSelect) return onSelect();
          const r = await current.onPay({ savedPaymentMethodId: first.paymentMethodId }, false);
          if (r.kind === "succeeded") current.onPaid();
        }}>{onSelect ? "Use last card" : "Pay last card"}</button>
      ) : null;
    },
    CardPay: (props: { dialogOpen: boolean }) => (
      <>
        <button type="button" disabled={current.disabled} onClick={async () => {
          const r = await current.onPay({ confirmationTokenId: "ctok_new" } as never, false);
          if (r.kind === "succeeded") current.onPaid();
          if (r.kind === "processing") current.onProcessing();
        }}>Pay now</button>
        {props.dialogOpen && <div data-testid="card-dialog" />}
      </>
    ),
  };
});

const reprice = vi.fn();
vi.mock("@/app/(public)/subscribe/actions", () => ({
  reprice: (...a: unknown[]) => reprice(...a),
  validatePostal: vi.fn().mockResolvedValue({ served: true, zone: { publicId: "zn_1", name: "Downtown", slotWindow: "6-8pm" } }),
}));

const pricing = { lineItems: [], adjustments: [], taxLines: [], taxTotal: 0, tiffinCount: 5, perTiffinPrice: 10, subtotal: 50, total: 50 };
const methods = [
  { id: "stripe", label: "Stripe (config label)" },
  { id: "cash", label: "Cash" },
];
const MEMBER = { fullName: "Jane Doe", email: "jane@example.com" };
const selections: WizardSelections = {
  planKey: "veg", mealSizeId: "msz_small_thali", frequencyKey: "5_day", persons: 1, mealSlots: [],
  includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2026-07-20",
};
const cardCtx: CardCheckoutContext = {
  publishableKey: "pk_test_x",
  methodLabel: "Credit or debit card",
  savedCards: [],
  prefill: { email: "jane@example.com", name: "Jane Doe", phone: null, address: { line1: "100 Queen St W", line2: "", city: "Toronto", state: "ON", postal_code: "M5H 2N2", country: "CA" } },
  feeNote: "+2.9% fee on credit cards",
};

async function toPayment(ctx: CardCheckoutContext | null = cardCtx) {
  render(<Checkout defaultCountry="CA" prefill={MEMBER} cardContext={ctx} />);
  fireEvent.change(await screen.findByLabelText(/phone/i), { target: { value: "4165551234" } });
  await enterAddress("M5H 1A1");
  const next = screen.getByRole("button", { name: /continue to payment/i });
  await waitFor(() => expect(next.getAttribute("aria-disabled")).toBeNull());
  fireEvent.click(next);
  await screen.findByText("Cash");
}

describe("Checkout Pay step", () => {
  beforeEach(() => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    reprice.mockImplementation(async (...a: unknown[]) => {
      const codes = a[1] as string[] | undefined;
      return {
        pricing, paymentMethods: methods, coinBalance: null,
        appliedCoupons: (codes ?? []).map((code) => ({ code, name: code, amount: 5, auto: false })),
      };
    });
    payCheckout.mockResolvedValue({ paymentPublicId: "pay_1", deploymentId: "dep_1", result: { kind: "succeeded" } });
    confirmSubscription.mockResolvedValue({ waitlisted: false, deploymentId: "dep_2", publicId: "o", paymentPublicId: "pay_2" });
  });
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("on a phone the wallet slot sits above the full-size Back and Pay row in the bar", async () => {
    await toPayment();
    const express = screen.getByTestId("express");
    const back = screen.getAllByRole("button", { name: /^back$/i }).at(-1)!;
    const pay = screen.getByRole("button", { name: "Pay now" });
    expect(express.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(express.compareDocumentPosition(pay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(back.className).toContain("min-h-[50px]");
  });

  it("stripe pays in place: no navigation, wizard cleared, Back blocked, receipt built from the server result in cents", async () => {
    await toPayment();
    expect(screen.getByTestId("express")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

    await waitFor(() => expect(sessionStorage.getItem("tg:paid")).toContain("dep_1"));
    expect(payCheckout).toHaveBeenCalledWith(expect.objectContaining({ paymentMethodId: "stripe", paymentPublicId: null }));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
    expect(confirmSubscription).not.toHaveBeenCalled();
    const { receipt, secondary } = hoistedReceipt.fn!({ paidWith: "Visa •••• 4242", totalCents: 5150, feeCents: 150 });
    expect(receipt).toMatchObject({
      title: "Your plan", total: 5150, orderRef: "dep_1", paidWith: "Visa •••• 4242",
      lines: [{ label: "Subtotal", amount: 5000 }, { label: "Card fee", amount: 150 }],
    });
    expect(secondary).toEqual({ label: "View order details", href: "/activate/dep_1" });
  });

  it("e-Transfer confirm creates the order then opens the dialog instead of navigating", async () => {
    reprice.mockImplementation(async () => ({ pricing, paymentMethods: [...methods, { id: "etransfer", label: "e-Transfer", payeeHandle: "pay@tiffin.ca", instructions: "Auto-deposit", requireProof: true }], coinBalance: null, appliedCoupons: [] }));
    await toPayment();
    fireEvent.click(await screen.findByRole("radio", { name: /e-transfer/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm subscription/i }));
    expect(await screen.findByTestId("etransfer-dialog")).toBeTruthy();
    expect(confirmSubscription).toHaveBeenCalledWith(expect.objectContaining({ paymentMethodId: "etransfer" }));
    expect(confirmSubscription).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(etransferProps.value!.payment).toMatchObject({ paymentPublicId: "pay_2", deploymentId: "dep_2", amount: 50, payeeHandle: "pay@tiffin.ca", requireProof: true });
    expect(await screen.findByTestId("paid-page")).toBeTruthy();
    expect(screen.queryByTestId("etransfer-dialog")).toBeNull();
    expect(screen.getByText("Submitted · we'll verify your e-Transfer")).toBeTruthy();
    expect(screen.getByText("Paid with")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to my deliveries" }).getAttribute("href")).toBe("/me/deliveries");
    expect(screen.getByRole("link", { name: "View order details" }).getAttribute("href")).toBe("/activate/dep_2");
    expect(sessionStorage.getItem("tg:paid")).toContain("dep_2");
  });

  it("closing the e-Transfer dialog without proof toasts and replaces to /activate", async () => {
    reprice.mockImplementation(async () => ({ pricing, paymentMethods: [...methods, { id: "etransfer", label: "e-Transfer" }], coinBalance: null, appliedCoupons: [] }));
    await toPayment();
    fireEvent.click(await screen.findByRole("radio", { name: /e-transfer/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm subscription/i }));
    await screen.findByTestId("etransfer-dialog");
    etransferProps.value!.onClosedWithoutProof!();
    expect(toast).toHaveBeenCalledWith("You can upload the screenshot later from Finances");
    expect(mockRouter.replace).toHaveBeenCalledWith("/activate/dep_2");
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(confirmSubscription).toHaveBeenCalledTimes(1);
  });

  it("after paying, a router identity change keeps the receipt instead of bouncing to /subscribe", async () => {
    const view = render(<Checkout defaultCountry="CA" prefill={MEMBER} cardContext={cardCtx} />);
    fireEvent.change(await screen.findByLabelText(/phone/i), { target: { value: "4165551234" } });
    await enterAddress("M5H 1A1");
    const next = screen.getByRole("button", { name: /continue to payment/i });
    await waitFor(() => expect(next.getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(next);
    await screen.findByText("Cash");
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(sessionStorage.getItem("tg:paid")).toContain("dep_1"));
    expect(window.location.pathname).not.toBe("/me/deliveries");
    routerNow = { ...mockRouter };
    view.rerender(<Checkout defaultCountry="CA" prefill={MEMBER} cardContext={cardCtx} />);
    routerNow = mockRouter;
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("a fresh mount with no selections and no paid state goes to /subscribe", async () => {
    sessionStorage.clear();
    render(<Checkout defaultCountry="CA" prefill={MEMBER} cardContext={cardCtx} />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/subscribe"));
  });

  it("Back into checkout after paying goes to /me/deliveries", async () => {
    window.history.replaceState({ tgSeen: true }, "");
    sessionStorage.setItem("tg:paid", JSON.stringify({ deploymentId: "dep_1", at: 1 }));
    render(<Checkout defaultCountry="CA" prefill={MEMBER} cardContext={cardCtx} />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/me/deliveries"));
  });

  it("a normal visit clears the paid flag and renders checkout", async () => {
    window.history.replaceState(null, "", "/checkout");
    sessionStorage.setItem("tg:paid", JSON.stringify({ deploymentId: "dep_1", at: 1 }));
    await toPayment();
    expect(sessionStorage.getItem("tg:paid")).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/me/deliveries");
  });

  it("the card's billing details are this order's phone and delivery address, in Canada", async () => {
    await toPayment();
    expect(lastCtx.value?.prefill).toMatchObject({
      email: "jane@example.com",
      phone: "+14165551234",
      address: { line1: "10 King St W", postal_code: "M5H 1A1", state: "ON", country: "CA" },
    });
  });

  it("Stripe.js starts loading on the address step, before Pay", async () => {
    render(<Checkout defaultCountry="CA" prefill={MEMBER} cardContext={cardCtx} />);
    await screen.findByLabelText(/phone/i);
    expect(warm).toHaveBeenCalledWith("pk_test_x");
    expect(screen.queryByTestId("express")).toBeNull();
  });

  it("wallets sit below the payment method cards", async () => {
    await toPayment();
    const cards = screen.getByRole("radiogroup", { name: /pay with/i });
    expect(cards.compareDocumentPosition(screen.getByTestId("express")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  const saved = [{ paymentMethodId: "pm_visa", brand: "visa", last4: "4242", funding: "credit" as const, expMonth: 4, expYear: 2030, isDefault: true }];

  it("a returning customer gets the last-used strip above Pay with, and its tap pays that card without the dialog", async () => {
    await toPayment({ ...cardCtx, savedCards: saved });
    const strip = screen.getByRole("button", { name: "Pay last card" });
    const options = screen.getByRole("radiogroup", { name: /pay with/i });
    expect(strip.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId("card-dialog")).toBeNull();
    fireEvent.click(strip);
    await waitFor(() => expect(payCheckout).toHaveBeenCalledWith(expect.objectContaining({ paymentMethodId: "stripe", source: { savedPaymentMethodId: "pm_visa" } })));
  });

  it("the options never list saved cards, and no strip without one", async () => {
    await toPayment({ ...cardCtx, savedCards: saved });
    const radios = within(screen.getByRole("radiogroup", { name: /pay with/i })).getAllByRole("radio");
    expect(radios.map((r) => document.getElementById(r.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["Stripe", "Cash"]);
    cleanup();
    await toPayment();
    expect(screen.queryByRole("button", { name: /last card/i })).toBeNull();
  });

  it("with cash selected the strip switches to Stripe first, so the charge is the Stripe total", async () => {
    await toPayment({ ...cardCtx, savedCards: saved });
    fireEvent.click(screen.getByRole("radio", { name: /cash/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Use last card" }));
    expect(payCheckout).not.toHaveBeenCalled();
    await screen.findByRole("button", { name: "Pay last card" });
    expect(screen.getByRole("radio", { name: "Stripe" }).getAttribute("data-state")).toBe("checked");
  });

  it("choosing Stripe opens the card form", async () => {
    await toPayment({ ...cardCtx, savedCards: saved });
    fireEvent.click(screen.getByRole("radio", { name: /cash/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Stripe" }));
    expect(await screen.findByTestId("card-dialog")).toBeTruthy();
  });

  it("no Review section: the order card carries address, window, phone and total, and Change goes back", async () => {
    await toPayment();
    expect(screen.queryByRole("heading", { name: "Review" })).toBeNull();
    const card = screen.getByRole("complementary", { name: "Order summary" });
    expect(card.textContent).toContain("10 King St W");
    expect(card.textContent).toContain("Arrives 6-8pm");
    expect(card.textContent).toContain("+1 416 555 1234");
    expect(card.textContent).toContain("$50.00");
    expect(within(card).getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/subscribe");
    // The mobile glance shows the address too, and opens the same summary.
    expect(screen.getAllByRole("button", { name: /your order/i }).some((b) => b.getAttribute("aria-haspopup") === "dialog" && b.textContent?.includes("To 10 King St W"))).toBe(true);
    fireEvent.click(within(card).getByRole("button", { name: "Change" }));
    expect(await screen.findByRole("button", { name: /continue to payment/i })).toBeTruthy();
    expect(within(screen.getByRole("complementary", { name: "Order summary" })).queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("desktop: Savings sits in the side column and a coupon there updates its total", async () => {
    const mm = vi.fn((q: string) => ({ matches: /min-width: (1024|640)px/.test(q), addEventListener: () => {}, removeEventListener: () => {} }));
    vi.stubGlobal("matchMedia", mm);
    try {
      reprice.mockImplementation(async (...a: unknown[]) => {
        const codes = (a[1] as string[] | undefined) ?? [];
        return { pricing: { ...pricing, total: codes.length ? 45 : 50 }, paymentMethods: methods, coinBalance: null, appliedCoupons: codes.map((code) => ({ code, name: code, amount: 5, auto: false })) };
      });
      await toPayment();
      const side = screen.getByRole("complementary", { name: "Order summary" });
      expect(within(side).getByRole("heading", { name: "Savings" })).toBeTruthy();
      expect(screen.getAllByRole("heading", { name: "Savings" })).toHaveLength(1);
      fireEvent.click(within(side).getByRole("button", { name: /add a coupon code/i }));
      fireEvent.change(await within(side).findByLabelText(/coupon code/i), { target: { value: "SAVE5" } });
      fireEvent.click(within(side).getByRole("button", { name: /apply coupon/i }));
      await waitFor(() => expect(side.textContent).toContain("$45.00"));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("phones pay from the bottom bar, with the total in it", async () => {
    await toPayment();
    const pay = screen.getByRole("button", { name: /pay now/i });
    expect(pay.closest(".c-glass")).toBeTruthy();
    expect(screen.getByText("Total $50.00")).toBeTruthy();
  });

  it("express is only offered while Stripe is selected", async () => {
    await toPayment();
    expect(screen.getByTestId("express")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /cash/i }));
    await waitFor(() => expect(screen.queryByTestId("express")).toBeNull());
  });

  it("sends the total it showed so the server can refuse a different charge", async () => {
    await toPayment();
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(payCheckout).toHaveBeenCalled());
    expect(payCheckout.mock.calls[0]![0].expectedAmountCents).toBe(5000);
  });

  it("a changed total re-prices so the next Pay sends the new one", async () => {
    payCheckout.mockResolvedValueOnce({ error: "Your total changed. Check it and pay again." });
    await toPayment();
    const before = reprice.mock.calls.length;
    reprice.mockImplementation(async () => ({ pricing: { ...pricing, total: 55 }, paymentMethods: methods, coinBalance: null, appliedCoupons: [] }));
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(reprice.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect((screen.getByRole("button", { name: /pay now/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(payCheckout).toHaveBeenCalledTimes(2));
    expect(payCheckout.mock.calls[1]![0].expectedAmountCents).toBe(5500);
  });

  it("pay is disabled while a reprice is in flight", async () => {
    await toPayment();
    let release!: () => void;
    reprice.mockImplementationOnce(() => new Promise((res) => { release = () => res({ pricing, paymentMethods: methods, coinBalance: null, appliedCoupons: [] }); }));
    fireEvent.click(screen.getByRole("button", { name: /add a coupon code/i }));
    fireEvent.change(await screen.findByLabelText(/coupon code/i), { target: { value: "SAVE5" } });
    fireEvent.click(screen.getByRole("button", { name: /apply coupon/i }));
    await waitFor(() => expect((screen.getByRole("button", { name: /pay now/i }) as HTMLButtonElement).disabled).toBe(true));
    release();
    await waitFor(() => expect((screen.getByRole("button", { name: /pay now/i }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("a processing card stays on the page (the receipt waits) and blocks Back", async () => {
    payCheckout.mockResolvedValue({ paymentPublicId: "pay_1", deploymentId: "dep_1", result: { kind: "processing" } });
    await toPayment();
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(sessionStorage.getItem("tg:paid")).toContain("dep_1"));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("changing coupon clears the remembered payment", async () => {
    payCheckout.mockResolvedValue({ paymentPublicId: "pay_1", deploymentId: "dep_1", result: { kind: "failed", message: "Declined" } });
    await toPayment();
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(payCheckout).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /add a coupon code/i }));
    fireEvent.change(await screen.findByLabelText(/coupon code/i), { target: { value: "SAVE5" } });
    fireEvent.click(screen.getByRole("button", { name: /apply coupon/i }));
    await screen.findByText(/coupon applied/i);

    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(payCheckout).toHaveBeenCalledTimes(2));
    expect(payCheckout.mock.calls[0]![0].paymentPublicId).toBeNull();
    expect(payCheckout.mock.calls[1]![0].paymentPublicId).toBeNull();
    expect(payCheckout.mock.calls[1]![0].couponCodes).toEqual(["SAVE5"]);
  });

  it("a retry with nothing changed reuses the remembered payment", async () => {
    payCheckout.mockResolvedValueOnce({ paymentPublicId: "pay_1", deploymentId: "dep_1", result: { kind: "failed", message: "Declined" } });
    await toPayment();
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(payCheckout).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(payCheckout).toHaveBeenCalledTimes(2));
    expect(payCheckout.mock.calls[1]![0].paymentPublicId).toBe("pay_1");
  });

  it("cash still confirms", async () => {
    await toPayment();
    fireEvent.click(screen.getByRole("radio", { name: /cash/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm subscription/i }));

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/activate/dep_2", expect.anything()));
    expect(confirmSubscription).toHaveBeenCalledWith(expect.objectContaining({ paymentMethodId: "cash" }));
    expect(payCheckout).not.toHaveBeenCalled();
  });

  it("the Stripe option is titled Stripe whatever the stored labels say, with its fee note", async () => {
    await toPayment();
    const stripe = screen.getByRole("radio", { name: "Stripe" });
    expect(stripe.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/\+2\.9% fee on credit cards/)).toBeTruthy();
    expect(screen.queryByText("Stripe (config label)")).toBeNull();
    expect(screen.queryByText("Credit or debit card")).toBeNull();
  });

  it("every payment option radio has an accessible name", async () => {
    await toPayment();
    const radios = within(screen.getByRole("radiogroup", { name: /pay with/i })).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-labelledby") && document.getElementById(r.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["Stripe", "Cash"]);
    expect(screen.getByRole("radio", { name: "Cash" })).toBeTruthy();
  });

  it("without a Stripe publishable key the Stripe option falls back to the pay page", async () => {
    await toPayment({ ...cardCtx, publishableKey: null });
    expect(screen.queryByTestId("express")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /confirm subscription/i }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/me/pay/pay_2", expect.anything()));
  });
});
