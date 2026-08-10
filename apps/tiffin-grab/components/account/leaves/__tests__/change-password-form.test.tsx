// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChangePasswordForm } from "../change-password-form";

const requestPasswordReset = vi.fn(async (_input: { email: string }) => ({}));
const useSession = vi.fn();

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    changePassword: vi.fn(),
    emailOtp: {
      requestPasswordReset: (input: { email: string }) => requestPasswordReset(input),
      resetPassword: vi.fn(),
    },
  },
  useSession: () => useSession(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useSession.mockReturnValue({ data: { user: { email: "ada@example.com" } } });
});

// This suite renders the same component repeatedly; without an explicit unmount
// the previous test's DOM is still in the document and every query matches twice.
afterEach(cleanup);

describe("ChangePasswordForm", () => {
  it("renders current + new password fields and a submit", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByRole("button", { name: /change password|update/i })).toBeDefined();
  });

  it("offers the forgot-current-password escape hatch when the session email is known", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByRole("button", { name: /forgot your current password/i })).toBeDefined();
  });

  it("hides the escape hatch until the session resolves — there is no address to send to", () => {
    useSession.mockReturnValue({ data: null });
    render(<ChangePasswordForm />);
    expect(screen.queryByRole("button", { name: /forgot your current password/i })).toBeNull();
  });

  it("sends the code to the session's own email, never a typed one", async () => {
    render(<ChangePasswordForm />);

    fireEvent.click(screen.getByRole("button", { name: /forgot your current password/i }));
    // No email input in this flow — the account is already known.
    expect(screen.queryByLabelText(/email/i)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /email me a code/i }));
    });
    expect(requestPasswordReset).toHaveBeenCalledWith({ email: "ada@example.com" });
  });
});
