// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignupForm } from "../signup-form";

vi.mock("../actions", () => ({ signUpCustomer: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ signIn: { phoneNumber: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("SignupForm", () => {
  it("renders a create-account action", () => {
    render(<SignupForm />);
    expect(screen.getByRole("button", { name: /create account|sign up/i })).toBeDefined();
  });
});
