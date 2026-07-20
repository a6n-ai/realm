// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("motion/react", () => ({ useReducedMotion: () => false }));

import { CustomerProfileMenu } from "../customer-profile-menu";

afterEach(cleanup);

describe("CustomerProfileMenu", () => {
  it("renders a link to /me/profile with the user's initial/avatar", () => {
    render(<CustomerProfileMenu user={{ name: "Asha", email: "a@x.com", image: null }} />);
    expect(screen.getByRole("link", { name: /account/i })).toHaveAttribute("href", "/me/account");
  });
});
