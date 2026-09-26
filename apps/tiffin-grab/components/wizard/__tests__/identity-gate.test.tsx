// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const checkExistingAccount = vi.fn();
const createCheckoutAccount = vi.fn();
vi.mock("@/app/(public)/subscribe/actions", () => ({
  checkExistingAccount: (...args: unknown[]) => checkExistingAccount(...args),
  createCheckoutAccount: (...args: unknown[]) => createCheckoutAccount(...args),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const sendVerificationOtp = vi.fn();
const signInEmailOtp = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  authClient: { emailOtp: { sendVerificationOtp: (...args: unknown[]) => sendVerificationOtp(...args) } },
  signIn: { emailOtp: (...args: unknown[]) => signInEmailOtp(...args) },
}));

// input-otp needs layout APIs jsdom lacks; a plain input keeps the contract.
vi.mock("@foundry/auth-ui", () => ({
  CodeOtp: ({ id, value, onChange, onComplete }: { id: string; value: string; onChange: (v: string) => void; onComplete?: (v: string) => void }) => (
    <input
      id={id}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        if (e.target.value.length === 6) onComplete?.(e.target.value);
      }}
    />
  ),
}));

import { IdentityGate } from "../identity-gate";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function enterEmail(email: string) {
  const user = userEvent.setup();
  render(<IdentityGate />);
  await user.type(screen.getByLabelText(/^email$/i), email);
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
  return user;
}

describe("IdentityGate", () => {
  it("shows the four wizard steps that follow, so the first screen is not a lone input", () => {
    render(<IdentityGate />);
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(4);
    for (const name of ["Baseline", "Bundle", "Schedule", "Start"]) expect(screen.getByText(name)).toBeInTheDocument();
  });

  it("bottom-bar Back leaves the flow from the email phase", async () => {
    const user = userEvent.setup();
    render(<IdentityGate />);
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("offers common email domains once @ is typed", async () => {
    const user = userEvent.setup();
    render(<IdentityGate />);
    await user.type(screen.getByLabelText(/^email$/i), "priya@g");
    await user.click(screen.getByRole("button", { name: /gmail\.com/i }));
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("priya@gmail.com");
  });

  it("sends an existing customer a code on the same screen and signs them in", async () => {
    checkExistingAccount.mockResolvedValue({ status: "matched" });
    sendVerificationOtp.mockResolvedValue({});
    signInEmailOtp.mockResolvedValue({});
    const user = await enterEmail("back@person.com");

    expect(await screen.findByLabelText(/code sent to back@person\.com/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute("readonly");
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
    expect(sendVerificationOtp).toHaveBeenCalledWith({ email: "back@person.com", type: "sign-in" });

    await user.type(screen.getByLabelText(/code sent to/i), "123456");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/me/renew"));
    expect(signInEmailOtp).toHaveBeenCalledWith({ email: "back@person.com", otp: "123456" });
  });

  it("creates the account for a new email before sending the code", async () => {
    checkExistingAccount.mockResolvedValue({ status: "new" });
    createCheckoutAccount.mockResolvedValue({ status: "created" });
    sendVerificationOtp.mockResolvedValue({});
    const user = await enterEmail("new@person.com");

    await user.type(await screen.findByLabelText(/full name/i), "Priya Shah");
    await user.click(screen.getByRole("button", { name: /send my code/i }));

    expect(await screen.findByLabelText(/code sent to new@person\.com/i)).toBeInTheDocument();
    expect(createCheckoutAccount).toHaveBeenCalledWith("new@person.com", "Priya Shah");
    expect(sendVerificationOtp).toHaveBeenCalledWith({ email: "new@person.com", type: "sign-in" });
  });

  it("has no guest path", async () => {
    checkExistingAccount.mockResolvedValue({ status: "new" });
    await enterEmail("new@person.com");
    await screen.findByLabelText(/full name/i);
    expect(screen.queryByRole("button", { name: /guest/i })).not.toBeInTheDocument();
  });

  it("keeps a wrong code on screen with a recovery message", async () => {
    checkExistingAccount.mockResolvedValue({ status: "matched" });
    sendVerificationOtp.mockResolvedValue({});
    signInEmailOtp.mockResolvedValue({ error: { message: "bad" } });
    const user = await enterEmail("back@person.com");
    await user.type(await screen.findByLabelText(/code sent to/i), "000000");
    expect(await screen.findByText(/wrong or expired/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("stops a staff email and points to the dashboard", async () => {
    checkExistingAccount.mockResolvedValue({ status: "staff" });
    const user = await enterEmail("admin@tiffingrab.ca");
    expect(await screen.findByRole("heading", { name: /staff account/i })).toBeInTheDocument();
    expect(sendVerificationOtp).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /sign in to the dashboard/i }));
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("lets the visitor change the email after the code is sent", async () => {
    checkExistingAccount.mockResolvedValue({ status: "matched" });
    sendVerificationOtp.mockResolvedValue({});
    const user = await enterEmail("back@person.com");
    await screen.findByLabelText(/code sent to/i);
    await user.click(screen.getByRole("button", { name: /use a different email/i }));
    expect(screen.getByLabelText(/^email$/i)).not.toHaveAttribute("readonly");
    await waitFor(() => expect(screen.queryByLabelText(/code sent to/i)).not.toBeInTheDocument());
  });
});
