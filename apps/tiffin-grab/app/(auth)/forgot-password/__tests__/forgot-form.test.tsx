// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ForgotForm } from "../forgot-form";

const { emailOtp, phoneNumber } = vi.hoisted(() => ({
  emailOtp: { requestPasswordReset: vi.fn(), resetPassword: vi.fn() },
  phoneNumber: { requestPasswordReset: vi.fn(), resetPassword: vi.fn() },
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { emailOtp, phoneNumber } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ForgotForm (OTP reset)", () => {
  it("renders the identifier request step", () => {
    render(<ForgotForm />);
    expect(screen.getByRole("button", { name: /send code/i })).toBeDefined();
  });

  it("emails an OTP and advances to the code step for an email identifier", async () => {
    emailOtp.requestPasswordReset.mockResolvedValue({});
    render(<ForgotForm />);
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: "user@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));
    await waitFor(() => expect(emailOtp.requestPasswordReset).toHaveBeenCalledWith({ email: "user@x.com" }));
    expect(screen.getByText(/enter your code/i)).toBeDefined();
    expect(phoneNumber.requestPasswordReset).not.toHaveBeenCalled();
  });
});
