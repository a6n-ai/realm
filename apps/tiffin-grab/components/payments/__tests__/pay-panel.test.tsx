// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";

const h = vi.hoisted(() => ({
  update: vi.fn(),
  submit: vi.fn(),
  createToken: vi.fn(),
  handleNextAction: vi.fn(),
  paymentElement: vi.fn(),
  expressReady: true,
}));

vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn(async () => ({})) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useStripe: () => ({ createConfirmationToken: h.createToken, handleNextAction: h.handleNextAction }),
  useElements: () => ({ update: h.update, submit: h.submit }),
  PaymentElement: (p: { options: unknown; onReady?: () => void }) => {
    h.paymentElement(p.options);
    p.onReady?.();
    return <div data-testid="payment-element" />;
  },
  ExpressCheckoutElement: (p: { onReady?: (e: { availablePaymentMethods: object }) => void }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (h.expressReady) p.onReady?.({ availablePaymentMethods: { link: true } }); }, []);
    return <div data-testid="express" />;
  },
}));
vi.mock("@foundry/themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@foundry/ui/use-mobile", () => ({ useIsMobile: () => false }));

import type { SavedCard } from "@foundry/payments/stripe";
import { PaymentMethodCards, defaultSavedCard, savedCardOf, savedChoice } from "@/components/checkout/payment-method-cards";
import { CardPay, CardPayProvider, ExpressPay } from "../pay-panel";

const ctx = (savedCards: CardCheckoutContext["savedCards"] = []): CardCheckoutContext => ({
  publishableKey: "pk_test_x",
  methodLabel: "Pay with Stripe",
  savedCards,
  prefill: { email: "a@b.co", name: "Ada", phone: "+14165550100", address: { line1: "100 Queen St W", line2: "", city: "Toronto", state: "ON", postal_code: "M5H 2N2", country: "CA" } },
  feeNote: null,
});
const card = (id: string, isDefault: boolean, last4 = isDefault ? "4242" : "1111") => ({ paymentMethodId: id, brand: "visa", last4, funding: "debit" as const, expMonth: 4, expYear: 2030, isDefault });

/** The same wiring the checkout and pay page use: saved cards and Stripe as choices, CardPay for the chosen one. */
function Choices({ saved }: { saved: SavedCard[] }) {
  const [id, setId] = useState(() => defaultSavedCard(saved));
  const [open, setOpen] = useState(false);
  return (
    <>
      <PaymentMethodCards
        methods={[{ id: "stripe", label: "Stripe" }]}
        savedCards={saved}
        value={id ? savedChoice(id) : "stripe"}
        onChange={(c) => { const k = savedCardOf(c); setId(k); if (!k) setOpen(true); }}
        labelledBy="pay-with"
      />
      <CardPay key={id ?? "new"} savedCardId={id} dialogOpen={open} onDialogOpenChange={setOpen} />
    </>
  );
}

function setup(over: Partial<React.ComponentProps<typeof CardPayProvider>> = {}, saved = [card("pm_other", false), card("pm_default", true)]) {
  const onPay = vi.fn(async () => ({ kind: "succeeded" as const }));
  const props = { ctx: ctx(saved), amountCents: 5000, onPay, onPaid: vi.fn(), onProcessing: vi.fn(), abandon: vi.fn(async () => {}), afterAction: vi.fn(async () => "paid" as const), ...over };
  const ui = (p: typeof props) => <CardPayProvider {...p}><Choices saved={p.ctx.savedCards} /></CardPayProvider>;
  const r = render(ui(props));
  return { ...props, rerender: (n: Partial<typeof props>) => r.rerender(ui({ ...props, ...n })) };
}

beforeEach(() => {
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

  it("saved cards come first, the default is preselected, and it pays in one press without the dialog", async () => {
    const s = setup();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-labelledby") && document.getElementById(r.getAttribute("aria-labelledby")!)?.textContent))
      .toEqual(["Visa •••• 1111", "Visa •••• 4242", "Stripe"]);
    expect(screen.getByRole("radio", { name: "Visa •••• 4242" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByText("Default")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    await waitFor(() => expect(s.onPay).toHaveBeenCalledWith({ savedPaymentMethodId: "pm_default" }, false));
    expect(screen.queryByTestId("payment-element")).toBeNull();
    expect(s.onPaid).toHaveBeenCalled();
  });

  it("choosing Stripe means a new card and opens the dialog with prefilled billing details", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Stripe" }));
    expect(screen.getByTestId("payment-element")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Add a card and pay" }));
    fireEvent.click(screen.getByRole("button", { name: /pay \$50\.00/i }));
    await waitFor(() => expect(h.createToken).toHaveBeenCalled());
    expect(h.createToken.mock.calls[0]![0].params).toEqual({
      payment_method_data: { billing_details: { name: "Ada", email: "a@b.co", phone: "+14165550100", address: { line1: "100 Queen St W", line2: "", city: "Toronto", state: "ON", postal_code: "M5H 2N2", country: "CA" } } },
    });
  });

  it("closing the dialog calls nothing", async () => {
    const s = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Stripe" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.onPay).not.toHaveBeenCalled();
  });

  it("fee confirmation re-pays with the same token and acceptSurcharge", async () => {
    const onPay = vi.fn()
      .mockResolvedValueOnce({ kind: "confirm_surcharge", surcharge: "1.50", newTotal: "51.50", brand: "visa", last4: "4242" })
      .mockResolvedValueOnce({ kind: "succeeded" });
    const s = setup({ onPay }, []);
    fireEvent.click(screen.getByRole("button", { name: "Add a card and pay" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A payment is already in progress.");
  });

  it("shows the renewal copy in the card dialog", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Stripe" }));
    expect(screen.getByText("We'll save this card for your renewals.")).toBeInTheDocument();
  });

  it("after 3DS succeeds, afterAction decides paid vs processing", async () => {
    h.handleNextAction.mockResolvedValue({});
    const onPay = vi.fn(async () => ({ kind: "requires_action" as const, clientSecret: "cs" }));
    const s = setup({ onPay, afterAction: vi.fn(async () => "processing" as const) });
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    await waitFor(() => expect(s.onProcessing).toHaveBeenCalled());
    expect(h.handleNextAction).toHaveBeenCalledWith({ clientSecret: "cs" });
    expect(s.onPaid).not.toHaveBeenCalled();
  });

  it("after 3DS succeeds with paid, calls onPaid", async () => {
    h.handleNextAction.mockResolvedValue({});
    const s = setup({ onPay: vi.fn(async () => ({ kind: "requires_action" as const, clientSecret: "cs" })) });
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    await waitFor(() => expect(s.onPaid).toHaveBeenCalled());
  });

  it("3DS failure abandons and shows the error", async () => {
    h.handleNextAction.mockResolvedValue({ error: { message: "Authentication failed" } });
    const s = setup({ onPay: vi.fn(async () => ({ kind: "requires_action" as const, clientSecret: "cs" })) });
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Authentication failed");
    expect(s.abandon).toHaveBeenCalled();
    expect(s.afterAction).not.toHaveBeenCalled();
  });

  it("rapid double press pays once", async () => {
    let release!: () => void;
    const onPay = vi.fn(() => new Promise<{ kind: "succeeded" }>((r) => { release = () => r({ kind: "succeeded" }); }));
    const s = setup({ onPay });
    const btn = screen.getByRole("button", { name: "Pay $50.00" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    release();
    await waitFor(() => expect(s.onPaid).toHaveBeenCalledTimes(1));
    expect(onPay).toHaveBeenCalledTimes(1);
  });

  it("express wallets stay in place but inert while the total is re-quoted", () => {
    const props = { ctx: ctx(), amountCents: 5000, onPay: vi.fn(), onPaid: vi.fn(), onProcessing: vi.fn(), abandon: vi.fn(async () => {}), afterAction: vi.fn(async () => "paid" as const) };
    const ui = (disabled: boolean) => <CardPayProvider {...props} disabled={disabled}><ExpressPay /></CardPayProvider>;
    const r = render(ui(true));
    expect(screen.getByTestId("express").parentElement).toHaveAttribute("inert");
    r.rerender(ui(false));
    expect(screen.getByTestId("express").parentElement).not.toHaveAttribute("inert");
  });

  it("the wallet slot shows a skeleton until Stripe reports ready", () => {
    h.expressReady = false;
    const props = { ctx: ctx(), amountCents: 5000, onPay: vi.fn(), onPaid: vi.fn(), onProcessing: vi.fn(), abandon: vi.fn(async () => {}), afterAction: vi.fn(async () => "paid" as const) };
    render(<CardPayProvider {...props}><ExpressPay /></CardPayProvider>);
    expect(document.querySelector("[data-slot=skeleton]")).toBeInTheDocument();
    expect(screen.getByTestId("express").parentElement).toHaveAttribute("inert");
    h.expressReady = true;
  });

  it("trust line shows Secured by Stripe", () => {
    setup();
    expect(screen.getByText("Secured by Stripe")).toBeInTheDocument();
  });
});
