// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";

const h = vi.hoisted(() => ({
  update: vi.fn(),
  submit: vi.fn(),
  createToken: vi.fn(),
  handleNextAction: vi.fn(),
  paymentElement: vi.fn(),
  elements: vi.fn(),
  pe: null as null | { onChange?: (e: unknown) => void; onLoadError?: () => void },
  expressReady: true,
}));

vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn(async () => ({})) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children, options }: { children: React.ReactNode; options: unknown }) => { h.elements(options); return <>{children}</>; },
  useStripe: () => ({ createConfirmationToken: h.createToken, handleNextAction: h.handleNextAction }),
  useElements: () => ({ update: h.update, submit: h.submit }),
  PaymentElement: (p: { options: unknown; onReady?: () => void; onChange?: (e: unknown) => void; onLoadError?: () => void }) => {
    h.paymentElement(p.options);
    h.pe = p;
    p.onReady?.();
    return <div data-testid="payment-element" />;
  },
  ExpressCheckoutElement: (p: { onReady?: (e: { availablePaymentMethods: object }) => void }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (h.expressReady) p.onReady?.({ availablePaymentMethods: { link: true } }); }, []);
    return <div data-testid="express" />;
  },
}));
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));
vi.mock("@foundry/themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@foundry/ui/use-mobile", () => ({ useIsMobile: () => false }));

import { PaymentMethodCards } from "@/components/checkout/payment-method-cards";
import { PaidPage } from "../paid-page";
import { CardPay, CardPayProvider, ExpressPay, PaidSwitch, type PaidInfo } from "../card-pay";

const receipt = (info: PaidInfo) => ({
  receipt: { title: "Veg thali", subtitle: "Regular", lines: [{ label: "Subtotal", amount: info.totalCents ?? 5000 }], total: info.totalCents ?? 5000, orderRef: "SUB-REF1", paidWith: info.paidWith, paidAt: Date.UTC(2026, 9, 21, 15, 0) },
});

const ctx = (savedCards: CardCheckoutContext["savedCards"] = []): CardCheckoutContext => ({
  publishableKey: "pk_test_x",
  methodLabel: "Pay with Stripe",
  savedCards,
  prefill: { email: "a@b.co", name: "Ada", phone: "+14165550100", address: { line1: "100 Queen St W", line2: "", city: "Toronto", state: "ON", postal_code: "M5H 2N2", country: "CA" } },
  feeNote: null,
});
const card = (id: string, isDefault: boolean, last4 = isDefault ? "4242" : "1111") => ({ paymentMethodId: id, brand: "visa", last4, funding: "debit" as const, expMonth: 4, expYear: 2030, isDefault });

/** The same wiring the checkout and pay page use: the options, Stripe opening the card form. */
function Choices() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PaymentMethodCards methods={[{ id: "stripe", label: "Stripe" }]} value="stripe" onChange={() => {}} labelledBy="pay-with" />
      <CardPay dialogOpen={open} onDialogOpenChange={setOpen} />
    </>
  );
}

function setup(over: Partial<React.ComponentProps<typeof CardPayProvider>> = {}, saved = [card("pm_other", false), card("pm_default", true)], session: string | null = null) {
  const onPay = vi.fn(async () => ({ kind: "succeeded" as const }));
  const customerSession = vi.fn(async () => session);
  const props = { customerSession, ctx: ctx(saved), amountCents: 5000, onPay, onPaid: vi.fn(), onProcessing: vi.fn(), receipt, abandon: vi.fn(async () => {}), afterAction: vi.fn(async () => ({ outcome: "paid" as const })), ...over };
  const ui = (p: typeof props) => <CardPayProvider {...p}><PaidSwitch whenPaid={(v) => <PaidPage kind="paid" subtitle="s" receipt={v.receipt} ready={v.ready} primary={v.primary} secondary={v.secondary} />}><Choices /></PaidSwitch></CardPayProvider>;
  const r = render(ui(props));
  return { ...props, rerender: (n: Partial<typeof props>) => r.rerender(ui({ ...props, ...n })) };
}

const openCard = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Pay by card" }));
  await screen.findByTestId("payment-element");
};

beforeEach(() => {
  h.pe = null;
  h.submit.mockResolvedValue({});
  h.createToken.mockResolvedValue({ confirmationToken: { id: "ctoken_1" } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PayPanel", () => {
  it("amount follows the quote", () => {
    const s = setup();
    s.rerender({ amountCents: 6500 });
    expect(h.update).toHaveBeenLastCalledWith({ amount: 6500 });
  });

  // The server creates the intent without payment_method_types; Stripe rejects a token from a restricted Elements.
  it("Elements never restricts payment method types", async () => {
    setup();
    await openCard();
    for (const [opts] of h.elements.mock.calls) expect(opts).not.toHaveProperty("allowedPaymentMethodTypes");
  });

  it("the options hold only the payment methods, never a saved-card tile", () => {
    setup();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => document.getElementById(r.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["Stripe"]);
  });

  it("opening the card form asks for a fresh customer session, and only the form's Elements gets it", async () => {
    const s = setup({}, [], "cuss_secret_1");
    expect(s.customerSession).not.toHaveBeenCalled();
    expect(h.elements.mock.calls.every((c) => !("customerSessionClientSecret" in (c[0] as object)))).toBe(true);
    await openCard();
    expect(s.customerSession).toHaveBeenCalledTimes(1);
    expect(h.elements).toHaveBeenLastCalledWith(expect.objectContaining({ customerSessionClientSecret: "cuss_secret_1" }));
  });

  it("each open mints a new session", async () => {
    const s = setup({}, [], "cuss_secret_1");
    await openCard();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await openCard();
    expect(s.customerSession).toHaveBeenCalledTimes(2);
  });

  it("no session for a customer Stripe does not know: the form still opens", async () => {
    setup({}, [], null);
    await openCard();
    expect(h.elements.mock.calls.at(-1)![0]).not.toHaveProperty("customerSessionClientSecret");
  });

  it("a form that fails to load with the session remounts once without it", async () => {
    setup({}, [], "cuss_expired");
    await openCard();
    expect(h.elements.mock.calls.at(-1)![0]).toHaveProperty("customerSessionClientSecret", "cuss_expired");
    const before = h.paymentElement.mock.calls.length;
    act(() => h.pe!.onLoadError!());
    await waitFor(() => expect(h.paymentElement.mock.calls.length).toBeGreaterThan(before));
    expect(h.elements.mock.calls.at(-1)![0]).not.toHaveProperty("customerSessionClientSecret");
    const after = h.paymentElement.mock.calls.length;
    act(() => h.pe!.onLoadError!());
    expect(h.paymentElement.mock.calls.length).toBe(after);
  });

  it("a saved card chosen in the form sends no billing details or redisplay flag", async () => {
    setup({}, [], "cuss_secret_1");
    await openCard();
    act(() => h.pe!.onChange!({ value: { type: "card", payment_method: { id: "pm_saved" } } }));
    fireEvent.click(screen.getByRole("button", { name: /pay \$50\.00/i }));
    await waitFor(() => expect(h.createToken).toHaveBeenCalled());
    expect(h.createToken.mock.calls[0]![0]).toEqual({ elements: expect.anything() });
  });

  it("choosing a new card after a saved one sends them again", async () => {
    setup({}, [], "cuss_secret_1");
    await openCard();
    act(() => h.pe!.onChange!({ value: { type: "card", payment_method: { id: "pm_saved" } } }));
    act(() => h.pe!.onChange!({ value: { type: "card" } }));
    fireEvent.click(screen.getByRole("button", { name: /pay \$50\.00/i }));
    await waitFor(() => expect(h.createToken).toHaveBeenCalled());
    expect(h.createToken.mock.calls[0]![0].params.payment_method_data).toMatchObject({ allow_redisplay: "always" });
  });

  it("Pay by card opens the dialog with prefilled billing details", async () => {
    setup();
    await openCard();
    expect(h.paymentElement).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: { billingDetails: { name: "never", email: "never", phone: "never", address: "never" } },
        defaultValues: { billingDetails: { email: "a@b.co", name: "Ada", phone: "+14165550100", address: { line1: "100 Queen St W", line2: "", city: "Toronto", state: "ON", postal_code: "M5H 2N2", country: "CA" } } },
      }),
    );
    expect(h.paymentElement.mock.calls[0]![0].wallets).not.toHaveProperty("link");
  });

  it("the card token carries the full billing details the form hides", async () => {
    setup({}, []);
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: /pay \$50\.00/i }));
    await waitFor(() => expect(h.createToken).toHaveBeenCalled());
    expect(h.createToken.mock.calls[0]![0].params).toEqual({
      payment_method_data: { allow_redisplay: "always", billing_details: { name: "Ada", email: "a@b.co", phone: "+14165550100", address: { line1: "100 Queen St W", line2: "", city: "Toronto", state: "ON", postal_code: "M5H 2N2", country: "CA" } } },
    });
  });

  it("closing the dialog calls nothing", async () => {
    const s = setup();
    await openCard();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.onPay).not.toHaveBeenCalled();
  });

  it("fee confirmation re-pays with the same token and acceptSurcharge", async () => {
    const onPay = vi.fn()
      .mockResolvedValueOnce({ kind: "confirm_surcharge", surcharge: "1.50", newTotal: "51.50", brand: "visa", last4: "4242" })
      .mockResolvedValueOnce({ kind: "succeeded" });
    const s = setup({ onPay }, []);
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    expect(await screen.findByText(/\$1\.50 card fee/)).toBeInTheDocument();
    expect(screen.getByText(/New total \$51\.50/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pay $51.50" }));
    await waitFor(() => expect(onPay).toHaveBeenLastCalledWith({ confirmationTokenId: "ctoken_1" }, true));
    expect(h.createToken).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(s.onPaid).toHaveBeenCalled());
  });

  it("shows a server error such as the busy lock", async () => {
    setup({ onPay: vi.fn(async () => ({ error: "A payment is already in progress." })) });
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A payment is already in progress.");
  });

  it("shows the renewal copy in the card dialog", async () => {
    setup();
    await openCard();
    expect(screen.getByText("We'll save this card for your renewals.")).toBeInTheDocument();
  });

  it("after 3DS succeeds, afterAction decides paid vs processing", async () => {
    h.handleNextAction.mockResolvedValue({});
    const onPay = vi.fn(async () => ({ kind: "requires_action" as const, clientSecret: "cs" }));
    const s = setup({ onPay, afterAction: vi.fn(async () => ({ outcome: "processing" as const })) });
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    await waitFor(() => expect(s.onProcessing).toHaveBeenCalled());
    expect(h.handleNextAction).toHaveBeenCalledWith({ clientSecret: "cs" });
    expect(s.onPaid).not.toHaveBeenCalled();
  });

  it("after 3DS succeeds with paid, calls onPaid", async () => {
    h.handleNextAction.mockResolvedValue({});
    const s = setup({ onPay: vi.fn(async () => ({ kind: "requires_action" as const, clientSecret: "cs" })) });
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    await waitFor(() => expect(s.onPaid).toHaveBeenCalled());
  });

  it("after 3DS the receipt shows the total the server charged, fee included", async () => {
    h.handleNextAction.mockResolvedValue({});
    const afterAction = vi.fn(async () => ({ outcome: "paid" as const, receipt: { paidWith: "Visa •••• 4242", feeCents: 150, totalCents: 5150 } }));
    setup({ onPay: vi.fn(async () => ({ kind: "requires_action" as const, clientSecret: "cs" })), afterAction });
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    await screen.findByText("SUB-REF1", {}, { timeout: 3000 });
    expect(screen.getAllByText("$51.50")).toHaveLength(2);
    expect(screen.getByText("Visa •••• 4242")).toBeInTheDocument();
  });

  it("3DS failure abandons and shows the error", async () => {
    h.handleNextAction.mockResolvedValue({ error: { message: "Authentication failed" } });
    const s = setup({ onPay: vi.fn(async () => ({ kind: "requires_action" as const, clientSecret: "cs" })) });
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Authentication failed");
    expect(s.abandon).toHaveBeenCalled();
    expect(s.afterAction).not.toHaveBeenCalled();
  });

  it("rapid double press pays once", async () => {
    let release!: () => void;
    const onPay = vi.fn(() => new Promise<{ kind: "succeeded" }>((r) => { release = () => r({ kind: "succeeded" }); }));
    const s = setup({ onPay });
    await openCard();
    const btn = screen.getByRole("button", { name: "Pay $50.00" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(onPay).toHaveBeenCalled());
    release();
    await waitFor(() => expect(s.onPaid).toHaveBeenCalledTimes(1));
    expect(onPay).toHaveBeenCalledTimes(1);
  });

  it("express wallets stay in place but inert while the total is re-quoted", () => {
    const props = { ctx: ctx(), amountCents: 5000, onPay: vi.fn(), onPaid: vi.fn(), onProcessing: vi.fn(), receipt, abandon: vi.fn(async () => {}), afterAction: vi.fn(async () => ({ outcome: "paid" as const })) };
    const ui = (disabled: boolean) => <CardPayProvider {...props} disabled={disabled}><ExpressPay /></CardPayProvider>;
    const r = render(ui(true));
    expect(screen.getByTestId("express").parentElement).toHaveAttribute("inert");
    r.rerender(ui(false));
    expect(screen.getByTestId("express").parentElement).not.toHaveAttribute("inert");
  });

  it("the wallet slot shows a skeleton until Stripe reports ready", () => {
    h.expressReady = false;
    const props = { ctx: ctx(), amountCents: 5000, onPay: vi.fn(), onPaid: vi.fn(), onProcessing: vi.fn(), receipt, abandon: vi.fn(async () => {}), afterAction: vi.fn(async () => ({ outcome: "paid" as const })) };
    render(<CardPayProvider {...props}><ExpressPay /></CardPayProvider>);
    expect(document.querySelector("[data-slot=skeleton]")).toBeInTheDocument();
    expect(screen.getByTestId("express").parentElement).toHaveAttribute("inert");
    h.expressReady = true;
  });

  it("trust line shows Secured by Stripe", () => {
    setup();
    expect(screen.getByText("Secured by Stripe")).toBeInTheDocument();
  });

  it("a card success prints the receipt in place of the pay area, with no navigation", async () => {
    const onPay = vi.fn(async () => ({ kind: "succeeded" as const, receipt: { paidWith: "Visa •••• 4242", feeCents: 150, totalCents: 5150 } }));
    const s = setup({ onPay });
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    await screen.findByText("SUB-REF1", {}, { timeout: 3000 });
    expect(await screen.findByRole("link", { name: "Go to my dashboard" }, { timeout: 3000 })).toHaveAttribute("href", "/me");
    expect(screen.getAllByText("$51.50")).toHaveLength(2);
    expect(screen.getByText("Visa •••• 4242")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View order details" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pay \$/ })).toBeNull();
    expect(s.onPaid).toHaveBeenCalledTimes(1);
  });

  it("a new-card success closes the dialog and the page prints the receipt", async () => {
    setup({}, []);
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    await screen.findByText("SUB-REF1", {}, { timeout: 3000 });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("paid-page")).toBeInTheDocument();
    // The receipt's actions land a beat after its order number; wait for them instead of racing the render.
    expect(await screen.findByRole("link", { name: "Go to my dashboard" }, { timeout: 3000 })).toHaveAttribute("href", "/me");
    expect(screen.queryByRole("link", { name: "View order details" })).toBeNull();
    expect(screen.queryByTestId("payment-element")).toBeNull();
  });

  it("a processing charge prints the waiting state with the same action", async () => {
    const s = setup({ onPay: vi.fn(async () => ({ kind: "processing" as const })) });
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    expect(await screen.findByText("We'll confirm by email.")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Go to my dashboard" }, { timeout: 3000 })).toHaveAttribute("href", "/me");
    expect(screen.queryByRole("link", { name: "View order details" })).toBeNull();
    expect(s.onProcessing).toHaveBeenCalled();
  });
});
