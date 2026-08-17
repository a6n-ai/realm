// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.hoisted(() => vi.fn());
const sendVerificationOtp = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const signInEmailOtp = vi.hoisted(() => vi.fn(async () => ({ data: { user: { role: "user" } }, error: null })));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { emailOtp: { sendVerificationOtp } },
  signIn: { emailOtp: signInEmailOtp },
}));

const { AccountAuth } = await import("@/components/account/account-auth");

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  push.mockReset();
  sendVerificationOtp.mockClear();
  signInEmailOtp.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function lookupReturns(body: { known: boolean; created: boolean }) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => body });
}

function typeEmail(value = "someone@example.test") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("AccountAuth", () => {
  it("sends a code straight away for an address that already has an account", async () => {
    lookupReturns({ known: true, created: false });
    render(<AccountAuth />);
    typeEmail();

    await waitFor(() => expect(sendVerificationOtp).toHaveBeenCalledWith({
      email: "someone@example.test",
      type: "sign-in",
    }));
    expect(await screen.findByLabelText("Code")).toBeInTheDocument();
  });

  it("asks a new visitor for a name before any code is requested", async () => {
    lookupReturns({ known: false, created: false });
    render(<AccountAuth />);
    typeEmail("new@example.test");

    expect(await screen.findByLabelText("Full name")).toBeInTheDocument();
    // The critical half: no code is mailed to an address with no account yet —
    // better-auth would not send one anyway (disableSignUp), so requesting it
    // here would leave the visitor waiting for mail that never arrives.
    expect(sendVerificationOtp).not.toHaveBeenCalled();
  });

  it("creates the account, then requests the code", async () => {
    lookupReturns({ known: false, created: false });
    render(<AccountAuth />);
    typeEmail("new@example.test");

    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Ada" } });
    lookupReturns({ known: true, created: true });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(sendVerificationOtp).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
    expect(body).toMatchObject({ email: "new@example.test", name: "Ada" });
  });

  it("offers a resend once the cooldown expires, and not before", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    lookupReturns({ known: true, created: false });
    render(<AccountAuth />);
    typeEmail();

    const resend = await screen.findByRole("button", { name: /Resend code in \d+s/ });
    expect(resend).toBeDisabled();

    await vi.advanceTimersByTimeAsync(31_000);

    const ready = await screen.findByRole("button", { name: "Resend code" });
    expect(ready).toBeEnabled();
    fireEvent.click(ready);
    await waitFor(() => expect(sendVerificationOtp).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("New code sent.")).toBeInTheDocument();
  });

  it("keeps the customer on the page when the code is wrong", async () => {
    lookupReturns({ known: true, created: false });
    signInEmailOtp.mockResolvedValueOnce({ data: null, error: { status: 400 } } as never);
    render(<AccountAuth />);
    typeEmail();

    fireEvent.change(await screen.findByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/code is not valid/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("lands a verified customer on their own area", async () => {
    lookupReturns({ known: true, created: false });
    render(<AccountAuth />);
    typeEmail();

    fireEvent.change(await screen.findByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/me"));
  });
});
