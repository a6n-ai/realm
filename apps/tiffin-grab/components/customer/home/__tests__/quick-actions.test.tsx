// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuickActions } from "../quick-actions";

afterEach(cleanup);

describe("QuickActions", () => {
  it("links to deliveries, meals, support and order", () => {
    render(<QuickActions />);
    const hrefs = Object.fromEntries(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]));
    expect(hrefs).toEqual({ Deliveries: "/me/deliveries", Meals: "/me/meals", Support: "/me/support", Order: "/subscribe" });
  });
});
