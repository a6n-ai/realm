// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvatarField } from "../avatar-field";

vi.mock("../avatar-actions", () => ({ updateMyAvatar: vi.fn(), removeMyAvatar: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("react-easy-crop", () => ({ default: () => null }));

describe("AvatarField", () => {
  it("shows initials fallback and a change-photo control when no image", () => {
    render(<AvatarField image={null} name="Aanya Roy" />);
    expect(screen.getByText("AR")).toBeDefined();
    expect(screen.getByRole("button", { name: /change|upload|photo/i })).toBeDefined();
  });
});
