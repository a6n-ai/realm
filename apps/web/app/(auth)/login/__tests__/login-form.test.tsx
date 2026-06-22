// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginForm } from "../login-form";

vi.mock("@/lib/auth/client", () => ({ signIn: { email: vi.fn(), phoneNumber: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

describe("LoginForm", () => {
  it("renders identifier + password fields", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/phone or email/i)).toBeDefined();
    // Password label points to the FormControl wrapper div (contains input + toggle),
    // so query the input by type instead.
    expect(screen.getByRole("textbox", { hidden: false })).toBeDefined();
    expect(document.querySelector('input[type="password"], input[type="text"][autocomplete="current-password"]')).not.toBeNull();
  });
});
