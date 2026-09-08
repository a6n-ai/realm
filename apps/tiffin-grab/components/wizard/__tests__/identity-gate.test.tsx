// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const checkExistingAccount = vi.fn();
vi.mock("@/app/(public)/subscribe/actions", () => ({
  checkExistingAccount: (...args: unknown[]) => checkExistingAccount(...args),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const sendVerificationOtp = vi.fn();
const signInEmailOtp = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  authClient: { emailOtp: { sendVerificationOtp: (...args: unknown[]) => sendVerificationOtp(...args) } },
  signIn: { emailOtp: (...args: unknown[]) => signInEmailOtp(...args) },
}));

import { IdentityGate } from "../identity-gate";

afterEach(() => {
  cleanup();
  checkExistingAccount.mockReset();
  sendVerificationOtp.mockReset();
  signInEmailOtp.mockReset();
  push.mockReset();
});

describe("IdentityGate", () => {
  it("renders the email step before any check has run", () => {
    render(<IdentityGate><div>wizard here</div></IdentityGate>);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByText("wizard here")).not.toBeInTheDocument();
  });

  it("reveals children when the account is new", async () => {
    checkExistingAccount.mockResolvedValue({ status: "new" });
    const user = userEvent.setup();
    render(<IdentityGate><div>wizard here</div></IdentityGate>);
    await user.type(screen.getByLabelText(/email/i), "new@person.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.getByText("wizard here")).toBeInTheDocument());
    expect(checkExistingAccount).toHaveBeenCalledWith("new@person.com");
  });

  it("fails open to the wizard when the lookup throws", async () => {
    checkExistingAccount.mockRejectedValue(new Error("db down"));
    const user = userEvent.setup();
    render(<IdentityGate><div>wizard here</div></IdentityGate>);
    await user.type(screen.getByLabelText(/email/i), "new@person.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.getByText("wizard here")).toBeInTheDocument());
  });

  it("shows a soft sign-in prompt on a match, without blocking", async () => {
    checkExistingAccount.mockResolvedValue({ status: "matched" });
    const user = userEvent.setup();
    render(<IdentityGate><div>wizard here</div></IdentityGate>);
    await user.type(screen.getByLabelText(/email/i), "existing@person.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /continue as guest/i })).toBeInTheDocument();
    expect(screen.queryByText("wizard here")).not.toBeInTheDocument();
  });

  it("reveals children when guest continues past a match", async () => {
    checkExistingAccount.mockResolvedValue({ status: "matched" });
    const user = userEvent.setup();
    render(<IdentityGate><div>wizard here</div></IdentityGate>);
    await user.type(screen.getByLabelText(/email/i), "existing@person.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByRole("button", { name: /continue as guest/i }));
    await user.click(screen.getByRole("button", { name: /continue as guest/i }));
    expect(screen.getByText("wizard here")).toBeInTheDocument();
  });

  it("sends an OTP and redirects to /me/renew on successful sign-in", async () => {
    checkExistingAccount.mockResolvedValue({ status: "matched" });
    sendVerificationOtp.mockResolvedValue(undefined);
    signInEmailOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<IdentityGate><div>wizard here</div></IdentityGate>);

    await user.type(screen.getByLabelText(/email/i), "existing@person.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByRole("button", { name: /^sign in$/i }));
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(sendVerificationOtp).toHaveBeenCalledWith({ email: "existing@person.com", type: "sign-in" });
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/verification code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/me/renew"));
  });

  it("shows an error and stays on the code step when the OTP is wrong", async () => {
    checkExistingAccount.mockResolvedValue({ status: "matched" });
    sendVerificationOtp.mockResolvedValue(undefined);
    signInEmailOtp.mockResolvedValue({ error: { message: "invalid" } });
    const user = userEvent.setup();
    render(<IdentityGate><div>wizard here</div></IdentityGate>);

    await user.type(screen.getByLabelText(/email/i), "existing@person.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByRole("button", { name: /^sign in$/i }));
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => screen.getByLabelText(/verification code/i));

    await user.type(screen.getByLabelText(/verification code/i), "000000");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText(/invalid or expired code/i)).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
