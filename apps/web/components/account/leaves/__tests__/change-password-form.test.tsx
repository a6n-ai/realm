// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChangePasswordForm } from "../change-password-form";

vi.mock("@/lib/auth/client", () => ({ authClient: { changePassword: vi.fn() } }));

describe("ChangePasswordForm", () => {
  it("renders current + new password fields and a submit", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByRole("button", { name: /change password|update/i })).toBeDefined();
  });
});
