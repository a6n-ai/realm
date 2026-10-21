// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ claim: vi.fn() }));
vi.mock("@foundry/ui/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/app/(customer)/me/wallet/actions", () => ({ claimPaymentAction: h.claim }));
vi.mock("@/components/ds", () => ({ makeImageThumbnail: async () => new File(["t"], "thumb.webp", { type: "image/webp" }) }));

import { EtransferDialog } from "../etransfer-dialog";

const payment = { paymentPublicId: "pay_1", deploymentId: "SUB-ABC123", amount: 84.5, payeeHandle: "pay@tiffin.ca", instructions: "Auto-deposit is on", requireProof: false };

function setup(over: Partial<typeof payment> = {}) {
  const onClosedWithoutProof = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <EtransferDialog open onOpenChange={onOpenChange} payment={{ ...payment, ...over }} renderSubmitted={() => <div>receipt-here</div>} onClosedWithoutProof={onClosedWithoutProof} />,
  );
  return { onClosedWithoutProof, onOpenChange };
}
const png = () => new File(["x"], "proof.png", { type: "image/png" });
const attach = () => fireEvent.change(screen.getByLabelText("Payment screenshot"), { target: { files: [png()] } });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EtransferDialog", () => {
  it("shows payee handle, amount and deployment id", () => {
    setup();
    expect(screen.getByText("Send $84.50 by e-Transfer")).toBeInTheDocument();
    expect(screen.getByText("pay@tiffin.ca")).toBeInTheDocument();
    expect(screen.getByText("SUB-ABC123")).toBeInTheDocument();
    expect(screen.getByText("Auto-deposit is on")).toBeInTheDocument();
  });

  it("submits the claim with the payment id then renders the receipt", async () => {
    h.claim.mockResolvedValue({ ok: true });
    setup();
    attach();
    fireEvent.click(screen.getByRole("button", { name: "I've sent the payment" }));
    await waitFor(() => expect(screen.getByText("receipt-here")).toBeInTheDocument());
    expect(h.claim).toHaveBeenCalledWith("pay_1", expect.any(FormData));
    expect((h.claim.mock.calls[0][1] as FormData).get("proof")).toBeInstanceOf(File);
  });

  it("calls onClosedWithoutProof when closed before submitting", () => {
    const { onClosedWithoutProof, onOpenChange } = setup();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClosedWithoutProof).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks submit without a file when proof is required", () => {
    setup({ requireProof: true });
    fireEvent.change(screen.getByPlaceholderText(/Interac/), { target: { value: "ref123" } });
    fireEvent.click(screen.getByRole("button", { name: "I've sent the payment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A payment screenshot is required");
    expect(h.claim).not.toHaveBeenCalled();
  });
});
