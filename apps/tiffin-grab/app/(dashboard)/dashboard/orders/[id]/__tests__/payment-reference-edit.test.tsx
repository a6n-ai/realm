// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const update = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../actions", () => ({
  updatePaymentReferenceAction: (...a: unknown[]) => update(...a),
  rejectPaymentAction: vi.fn(),
  sendPaymentReminderAction: vi.fn(),
  verifyPaymentAction: vi.fn(),
}));
vi.mock("@/components/customer/wallet/claim-payment", () => ({ ClaimPayment: () => null }));

const { PaymentsPanel } = await import("../payments-panel");

const payment = (over: Record<string, unknown> = {}) => ({
  publicId: "pay_1", amount: "100.00", status: "pending_verification", method: "etransfer", reference: "OLD1",
  proof: null, claimedAt: null, capturedAt: null, createdAt: 0, note: null, proofThumbUrl: null, proofHref: null, ...over,
});
const mount = (p: ReturnType<typeof payment>) =>
  render(<PaymentsPanel orderId="ord_1" deploymentId="SUB-1" orderTotal={100} currency="CAD" timezone="America/Toronto" checkoutMethodLabel={null} pricingSnapshot={null} payments={[p as never]} />);

describe("payment reference edit", () => {
  afterEach(() => (cleanup(), update.mockReset()));

  it("edits an existing reference and saves through the action", async () => {
    update.mockResolvedValue({ ok: true });
    mount(payment());
    fireEvent.click(screen.getByRole("button", { name: "Edit reference" }));
    const input = screen.getByLabelText("Reference");
    expect(input).toHaveValue("OLD1");
    fireEvent.change(input, { target: { value: "NEW2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("ord_1", "pay_1", "NEW2"));
  });

  it("offers Add reference when empty, but not on simulated payments; Esc cancels", () => {
    mount(payment({ reference: null }));
    fireEvent.click(screen.getByRole("button", { name: "Add reference" }));
    fireEvent.keyDown(screen.getByLabelText("Reference"), { key: "Escape" });
    expect(screen.queryByLabelText("Reference")).toBeNull();
    cleanup();
    mount(payment({ reference: null, method: "simulated", status: "simulated_paid" }));
    expect(screen.queryByRole("button", { name: "Add reference" })).toBeNull();
  });
});
