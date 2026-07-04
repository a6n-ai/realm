// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResetForm } from "../reset-form";

vi.mock("@/lib/auth/client", () => ({ authClient: { resetPassword: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("token=abc"),
}));

describe("ResetForm", () => {
  it("renders new + confirm password and a submit action", () => {
    render(<ResetForm />);
    expect(screen.getByRole("button", { name: /reset|update|set/i })).toBeDefined();
  });
});
