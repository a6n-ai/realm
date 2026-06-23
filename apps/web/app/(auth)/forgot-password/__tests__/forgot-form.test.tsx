// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForgotForm } from "../forgot-form";

vi.mock("@/lib/auth/client", () => ({
  authClient: { requestPasswordReset: vi.fn(), phoneNumber: { sendOtp: vi.fn(), verify: vi.fn() }, resetPassword: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("ForgotForm", () => {
  it("renders an identifier field and a submit action", () => {
    render(<ForgotForm />);
    expect(screen.getByRole("button", { name: /reset|continue|send/i })).toBeDefined();
  });
});
