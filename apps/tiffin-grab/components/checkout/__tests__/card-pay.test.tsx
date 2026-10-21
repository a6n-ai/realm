// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { Checkout } from "../checkout";
import { enterAddress } from "./address-helper";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const payCheckout = vi.fn();
const confirmSubscription = vi.fn();
vi.mock("@/app/(public)/checkout/actions", () => ({
  confirmSubscription: (...a: unknown[]) => confirmSubscription(...a),
  payCheckout: (...a: unknown[]) => payCheckout(...a),
}));
vi.mock("@/app/(customer)/me/pay/[paymentId]/actions", () => ({
  confirmReturn: vi.fn(),
  abandonCard: vi.fn(),
}));

const lastCtx = vi.hoisted(() => ({ value: null as CardCheckoutContext | null }));
// The real pieces need Stripe.js; these stand-ins call the same props the real ones do.
vi.mock("@/components/payments/pay-panel", () => {
  type P = {
    onPay: (s: { savedPaymentMethodId: string }, accept: boolean) => Promise<{ kind: string }>;
    onPaid: () => void;
    onProcessing: () => void;
    disabled?: boolean;
    children: ReactNode;
  };
  let current: P;
  return {
    CardPayProvider: (p: P) => { current = p; lastCtx.value = (p as unknown as { ctx: CardCheckoutContext }).ctx; return <div data-testid="provider">{p.children}</div>; },
    ExpressPay: () => <div data-testid="express" />,
    CardPay: () => (
      <button type="button" disabled={current.disabled} onClick={async () => {
        const r = await current.onPay({ savedPaymentMethodId: "pm_1" }, false);
        if (r.kind === "succeeded") current.onPaid();
        if (r.kind === "processing") current.onProcessing();
      }}>Pay now</button>
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
  prefill: { email: "jane@example.com", name: "Jane Doe", phone: null, country: "CA", postalCode: null },
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

  it("stripe pays in place", async () => {
    await toPayment();
    expect(screen.getByTestId("express")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/activate/dep_1", expect.anything()));
    expect(payCheckout).toHaveBeenCalledWith(expect.objectContaining({ paymentMethodId: "stripe", paymentPublicId: null }));
    expect(mockRouter.push.mock.calls.some(([u]) => String(u).startsWith("/me/pay/"))).toBe(false);
    expect(confirmSubscription).not.toHaveBeenCalled();
  });

  it("the card form is prefilled with this order's phone and postal code, in Canada", async () => {
    await toPayment();
    expect(lastCtx.value?.prefill).toMatchObject({ phone: "+14165551234", postalCode: "M5H 1A1", country: "CA", email: "jane@example.com" });
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

  it("a processing card goes to the pay page to watch it settle", async () => {
    payCheckout.mockResolvedValue({ paymentPublicId: "pay_1", deploymentId: "dep_1", result: { kind: "processing" } });
    await toPayment();
    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/me/pay/pay_1?return=1", expect.anything()));
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
    expect(document.getElementById(stripe.getAttribute("aria-describedby")!)?.textContent).toContain("+2.9% fee on credit cards");
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
