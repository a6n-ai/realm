// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";

const h = vi.hoisted(() => ({
  update: vi.fn(),
  submit: vi.fn(),
  createToken: vi.fn(),
  handleNextAction: vi.fn(),
  paymentElement: vi.fn(),
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
  ExpressCheckoutElement: () => <div data-testid="express" />,
}));
vi.mock("@foundry/themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@foundry/ui/use-mobile", () => ({ useIsMobile: () => false }));

import { CardPay, CardPayProvider } from "../pay-panel";

const ctx = (savedCards: CardCheckoutContext["savedCards"] = []): CardCheckoutContext => ({
  publishableKey: "pk_test_x",
  methodLabel: "Pay with Stripe",
  savedCards,
  prefill: { email: "a@b.co", name: "Ada", phone: "+14165550100" },
  feeNote: null,
});
const card = (id: string, isDefault: boolean) => ({ paymentMethodId: id, brand: "visa", last4: "4242", funding: "debit" as const, expMonth: 4, expYear: 2030, isDefault });

function setup(over: Partial<React.ComponentProps<typeof CardPayProvider>> = {}, saved = [card("pm_other", false), card("pm_default", true)]) {
  const onPay = vi.fn(async () => ({ kind: "succeeded" as const }));
  const props = { ctx: ctx(saved), amountCents: 5000, onPay, onPaid: vi.fn(), onProcessing: vi.fn(), abandon: vi.fn(async () => {}), afterAction: vi.fn(async () => "paid" as const), ...over };
  const ui = (p: typeof props) => <CardPayProvider {...p}><CardPay /></CardPayProvider>;
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

  it("default saved card is preselected and pays without the dialog", async () => {
    const s = setup();
    fireEvent.click(screen.getByRole("button", { name: "Pay $50.00" }));
    await waitFor(() => expect(s.onPay).toHaveBeenCalledWith({ savedPaymentMethodId: "pm_default" }, false));
    expect(screen.queryByTestId("payment-element")).toBeNull();
    expect(s.onPaid).toHaveBeenCalled();
  });

  it("new card opens the dialog with prefilled billing details", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Use another card" }));
    expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    expect(h.paymentElement).toHaveBeenCalledWith(
      expect.objectContaining({ defaultValues: { billingDetails: { email: "a@b.co", name: "Ada", phone: "+14165550100" } } }),
    );
  });

  it("closing the dialog calls nothing", async () => {
    const s = setup();
    fireEvent.click(screen.getByRole("button", { name: "Use another card" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Use another card" }));
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

  it("trust line shows Secured by Stripe", () => {
    setup();
    expect(screen.getByText("Secured by Stripe")).toBeInTheDocument();
  });
});
