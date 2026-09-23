// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/organization/overview" }));

import { OrgNav } from "../org-nav";

describe("OrgNav", () => {
  it("renders all four sections with the current one marked active", () => {
    render(<OrgNav />);
    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /invites/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });
});
