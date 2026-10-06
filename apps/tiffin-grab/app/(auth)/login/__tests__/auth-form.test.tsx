// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AuthForm } from "../auth-form";
import { authClient, signIn } from "@/lib/auth/client";

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
  it("opens straight on the sign-in form, with a way to start a subscription", () => {
    render(<AuthForm canUsePin={false} />);
    expect(screen.getByRole("button", { name: /email me a code/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /start a subscription/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /unlock with your pin/i })).toBeNull();
  });

  it("welcomes back the last user on this device and prefills their email", () => {
    render(
      <AuthForm
        canUsePin={false}
        lastUser={{ firstName: "Vijay", email: "vijay@gmail.com", maskedEmail: "vi•••@gmail.com", method: "email" }}
      />,
    );
    expect(screen.getByText(/welcome back/i)).toBeDefined();
    expect(screen.getByText("Vijay")).toBeDefined();
    expect(screen.getByText("vijay@gmail.com")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect((screen.getByPlaceholderText(/you@example.com/i) as HTMLInputElement).value).toBe("vijay@gmail.com");
  });

  it("forgets the last user on 'Not you?'", () => {
    render(
      <AuthForm
        canUsePin={false}
        lastUser={{ firstName: "Vijay", email: "vijay@gmail.com", maskedEmail: "vi•••@gmail.com", method: "email" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /not you/i }));
    expect(screen.queryByText("Vijay")).toBeNull();
    expect((screen.getByPlaceholderText(/you@example.com/i) as HTMLInputElement).value).toBe("");
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

describe("AuthForm messages", () => {
  async function toCodeStep(sendResult: unknown) {
    vi.mocked(authClient.emailOtp.sendVerificationOtp).mockResolvedValue(sendResult as never);
    render(<AuthForm canUsePin={false} />);
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: "who@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /email me a code/i }));
  }

  it("opens the code step even when the send fails, without saying whether the account exists", async () => {
    await toCodeStep({ error: { status: 500 } });
    await waitFor(() => expect(screen.getByRole("heading", { name: /enter the code/i })).toBeDefined());
    expect(screen.getByText(/if there's an account for this email/i)).toBeDefined();
    expect(screen.queryByText(/couldn't send/i)).toBeNull();
  });

  it("shows the expired-code message from the server's error code", async () => {
    await toCodeStep({});
    vi.mocked(signIn.emailOtp).mockResolvedValue({ error: { code: "OTP_EXPIRED", status: 400 } } as never);
    const otp = await waitFor(() => {
      const el = document.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement | null;
      if (!el) throw new Error("code field not open yet");
      return el;
    });
    // Six digits auto-submit (onComplete); no button press needed.
    fireEvent.change(otp, { target: { value: "123456" } });
    await waitFor(() => expect(screen.getByText(/that code has expired/i)).toBeDefined());
  });

  it("explains a wrong password and points at reset", async () => {
    vi.mocked(signIn.email).mockResolvedValue({ error: { status: 401, message: "Invalid email or password" } } as never);
    render(<AuthForm canUsePin={false} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with a password instead/i }));
    fireEvent.change(document.querySelector('input[autocomplete="email"]')!, { target: { value: "a@b.com" } });
    fireEvent.change(document.querySelector('input[autocomplete="current-password"]')!, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByText(/email and password don't match/i)).toBeDefined());
  });
});

describe("safeCallbackUrl", () => {
  it("keeps same-site paths and drops anything that could leave the site", async () => {
    const { safeCallbackUrl } = await import("../auth-form");
    expect(safeCallbackUrl("/me/deliveries?x=1")).toBe("/me/deliveries?x=1");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "javascript:alert(1)", "", null]) {
      expect(safeCallbackUrl(bad)).toBeNull();
    }
  });
});
