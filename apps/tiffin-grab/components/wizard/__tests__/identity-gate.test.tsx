// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const checkExistingAccount = vi.fn();
vi.mock("@/app/(public)/subscribe/actions", () => ({
  checkExistingAccount: (...args: unknown[]) => checkExistingAccount(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { IdentityGate } from "../identity-gate";

afterEach(() => {
  cleanup();
  checkExistingAccount.mockReset();
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
});
