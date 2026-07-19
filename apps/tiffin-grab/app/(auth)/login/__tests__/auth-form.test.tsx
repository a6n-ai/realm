// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AuthForm } from "../auth-form";

afterEach(cleanup);

vi.mock("@/lib/auth/client", () => ({
  signIn: { email: vi.fn(), emailOtp: vi.fn() },
  authClient: { emailOtp: { sendVerificationOtp: vi.fn() } },
}));
vi.mock("@/lib/auth/lock-actions", () => ({ clearLockSession: vi.fn() }));
vi.mock("../actions", () => ({ verifyPinAction: vi.fn() }));
vi.mock("@/components/pin-otp", () => ({ PinOtp: () => <div data-testid="pin-otp" /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("AuthForm", () => {
  it("defaults to email-OTP mode with no PIN toggle when canUsePin is false", () => {
    render(<AuthForm canUsePin={false} />);
    expect(screen.getByRole("button", { name: /email me a code/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /unlock with your pin/i })).toBeNull();
  });

  it("switches to the password panel with an email field", () => {
    render(<AuthForm canUsePin={false} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with a password instead/i }));
    expect(document.querySelector('input[autocomplete="email"]')).not.toBeNull();
    expect(document.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
  });

  it("opens in PIN mode with a password fallback when canUsePin is true", () => {
    render(<AuthForm canUsePin={true} />);
    expect(screen.getByTestId("pin-otp")).toBeDefined();
    expect(screen.getByRole("button", { name: /^unlock$/i })).toBeDefined();
    expect(screen.getByText(/sign in with password instead/i)).toBeDefined();
  });

  it("accepts a 6-digit code typed into the segmented OTP field after requesting a code", async () => {
    render(<AuthForm canUsePin={false} />);
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: "user@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /email me a code/i }));
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeDefined());
    const otpInput = document.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement;
    expect(otpInput).not.toBeNull();
    fireEvent.change(otpInput, { target: { value: "123456" } });
    expect(otpInput.value).toBe("123456");
  });
});
