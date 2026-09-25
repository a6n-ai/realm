// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimPayment } from "../claim-payment";
import type { ClaimPaymentContext } from "@/lib/services/orders.service";

const mockClaimPaymentAction = vi.fn();
const mockRefresh = vi.fn();
const mockToast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock("@/app/(customer)/me/wallet/actions", () => ({
  claimPaymentAction: (...args: unknown[]) => mockClaimPaymentAction(...args),
}));

vi.mock("@/components/ds", () => ({
  makeImageThumbnail: vi.fn(async (file: File) => new File([file], "thumb.jpg", { type: "image/jpeg" })),
}));

describe("ClaimPayment rigorous event & upload testing", () => {
  const baseCtx: ClaimPaymentContext = {
    paymentPublicId: "pay_123",
    orderPublicId: "ord_123",
    status: "awaiting_payment",
    amount: "100.00",
    methodLabel: "Interac e-Transfer",
    requireProof: false,
    payeeHandle: "pay@tiffingrab.com",
    instructions: "Send transfer with reference",
    referenceHint: "REF-1234",
    deploymentId: "dep_1",
    methodId: "interac",
    rejectNote: null,
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("submits payment successfully with valid reference and screenshot", async () => {
    mockClaimPaymentAction.mockResolvedValueOnce({ ok: true });
    const onDone = vi.fn();

    render(<ClaimPayment ctx={baseCtx} currency="CAD" onDone={onDone} />);

    const refInput = screen.getByPlaceholderText("Interac confirmation / reference #");
    fireEvent.change(refInput, { target: { value: "REF999" } });

    const file = new File(["dummy content"], "screenshot.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    const submitBtn = screen.getByRole("button", { name: "I've sent the payment" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockClaimPaymentAction).toHaveBeenCalledWith("pay_123", expect.any(FormData));
      expect(mockToast).toHaveBeenCalledWith("Payment submitted — we'll confirm it shortly");
      expect(onDone).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("rejects invalid file types and displays a clear message without throwing", async () => {
    render(<ClaimPayment ctx={baseCtx} currency="CAD" />);

    const badFile = new File(["fake pdf"], "invoice.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByText("Only PNG, JPEG, WebP or GIF images are allowed")).toBeInTheDocument();
    });
  });

  it("rejects files larger than 5 MB without throwing", async () => {
    render(<ClaimPayment ctx={baseCtx} currency="CAD" />);

    const bigFile = new File(["x".repeat(100)], "huge.png", { type: "image/png" });
    Object.defineProperty(bigFile, "size", { value: 6 * 1024 * 1024 });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByText("Screenshot must be 5 MB or smaller")).toBeInTheDocument();
    });
  });

  it("sanitizes Minified React error #441 if returned from server action", async () => {
    mockClaimPaymentAction.mockResolvedValueOnce({
      error: "Minified React error #441; visit https://reactjs.org/docs/error-decoder.html?invariant=441",
    });

    render(<ClaimPayment ctx={baseCtx} currency="CAD" />);

    const refInput = screen.getByPlaceholderText("Interac confirmation / reference #");
    fireEvent.change(refInput, { target: { value: "REF999" } });

    const submitBtn = screen.getByRole("button", { name: "I've sent the payment" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // Must NOT display Minified React error #441 anywhere in the DOM
      expect(screen.queryByText(/Minified React error/)).not.toBeInTheDocument();
      expect(screen.queryByText(/invariant=441/)).not.toBeInTheDocument();
      // Must display clean friendly error
      expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    });
  });

  it("sanitizes unhandled thrown error / #441 in the catch block", async () => {
    mockClaimPaymentAction.mockRejectedValueOnce(
      new Error("Minified React error #441; visit https://reactjs.org/docs/error-decoder.html?invariant=441"),
    );

    render(<ClaimPayment ctx={baseCtx} currency="CAD" />);

    const refInput = screen.getByPlaceholderText("Interac confirmation / reference #");
    fireEvent.change(refInput, { target: { value: "REF999" } });

    const submitBtn = screen.getByRole("button", { name: "I've sent the payment" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // Must NOT display Minified React error #441
      expect(screen.queryByText(/Minified React error/)).not.toBeInTheDocument();
      // Must display custom fallback
      expect(screen.getByText("Could not submit payment. Please try again.")).toBeInTheDocument();
    });
  });

  it("displays normal validation error from server safely", async () => {
    mockClaimPaymentAction.mockResolvedValueOnce({
      error: "Payment reference has already been used",
    });

    render(<ClaimPayment ctx={baseCtx} currency="CAD" />);

    const refInput = screen.getByPlaceholderText("Interac confirmation / reference #");
    fireEvent.change(refInput, { target: { value: "REF111" } });

    const submitBtn = screen.getByRole("button", { name: "I've sent the payment" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Payment reference has already been used")).toBeInTheDocument();
    });
  });
});
