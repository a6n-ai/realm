// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AuthForm } from "../auth-form";

afterEach(cleanup);

vi.mock("@/lib/auth/client", () => ({ signIn: { email: vi.fn(), phoneNumber: vi.fn() } }));
vi.mock("@/lib/auth/lock-actions", () => ({ clearLockSession: vi.fn() }));
vi.mock("../actions", () => ({ verifyPinAction: vi.fn() }));
vi.mock("@/components/pin-otp", () => ({ PinOtp: () => <div data-testid="pin-otp" /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("AuthForm", () => {
  it("defaults to password mode with Phone/Email tabs and no PIN toggle when canUsePin is false", () => {
    render(<AuthForm canUsePin={false} defaultCountry="CA" />);
    expect(screen.getByRole("tab", { name: /phone/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /email/i })).toBeDefined();
    expect(document.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /unlock with your pin/i })).toBeNull();
  });

  it("switches to the email field when the Email tab is selected", () => {
    render(<AuthForm canUsePin={false} defaultCountry="CA" />);
    const emailTab = screen.getByRole("tab", { name: /email/i });
    fireEvent.mouseDown(emailTab); // radix Tabs activates on pointer-down, not click
    fireEvent.click(emailTab);
    expect(document.querySelector('input[autocomplete="email"]')).not.toBeNull();
  });

  it("opens in PIN mode with a password fallback when canUsePin is true", () => {
    render(<AuthForm canUsePin={true} defaultCountry="CA" />);
    expect(screen.getByTestId("pin-otp")).toBeDefined();
    expect(screen.getByRole("button", { name: /^unlock$/i })).toBeDefined();
    expect(screen.getByText(/sign in with password instead/i)).toBeDefined();
  });
});
