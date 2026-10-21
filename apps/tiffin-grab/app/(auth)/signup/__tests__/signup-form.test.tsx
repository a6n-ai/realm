// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SignupForm } from "../signup-form";

vi.mock("../actions", () => ({ signUpCustomer: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ signIn: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("SignupForm", () => {
  it("renders a create-account action", () => {
    render(<SignupForm defaultCountry="CA" />);
    expect(screen.getByRole("button", { name: /create account|sign up/i })).toBeDefined();
  });
});

describe("SignupForm referral code", () => {
  it("offers an optional referral code field, prefilled from the share link", () => {
    cleanup();
    render(<SignupForm defaultCountry="CA" defaultReferralCode="ABCD2345" />);
    const input = screen.getByLabelText(/referral code/i) as HTMLInputElement;
    expect(input.value).toBe("ABCD2345");
  });
});
