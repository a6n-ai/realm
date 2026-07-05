// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthForm } from "../auth-form";

vi.mock("@/lib/auth/client", () => ({ signIn: { email: vi.fn(), phoneNumber: vi.fn() } }));
vi.mock("@/lib/auth/lock-actions", () => ({ clearLockSession: vi.fn() }));
vi.mock("../actions", () => ({ verifyPinAction: vi.fn() }));
vi.mock("@/components/pin-otp", () => ({ PinOtp: () => <div data-testid="pin-otp" /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("AuthForm", () => {
  it("defaults to password mode with no PIN toggle when canUsePin is false", () => {
    render(<AuthForm canUsePin={false} />);
    expect(screen.getByLabelText(/phone or email/i)).toBeDefined();
    expect(document.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /unlock with your pin/i })).toBeNull();
  });

  it("opens in PIN mode with a password fallback when canUsePin is true", () => {
    render(<AuthForm canUsePin={true} />);
    expect(screen.getByTestId("pin-otp")).toBeDefined();
    expect(screen.getByRole("button", { name: /^unlock$/i })).toBeDefined();
    expect(screen.getByText(/sign in with password instead/i)).toBeDefined();
  });
});
