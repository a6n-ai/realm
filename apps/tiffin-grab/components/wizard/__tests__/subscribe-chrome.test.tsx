// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: ReactNode }) => <div>{children}</div>, {
    Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  }),
}));

import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";

afterEach(cleanup);

describe("SubscribeChrome", () => {
  it("renders Close linking to closeHref", () => {
    render(<SubscribeChrome closeHref="/me" />);
    expect(screen.getByRole("link", { name: /Close/i })).toHaveAttribute("href", "/me");
    // Back lives in the page's bottom bar; the top bar only carries one when asked (the paid screen).
    expect(screen.queryByRole("button", { name: /Back/i })).toBeNull();
  });

  it("renders a top Back only with topBack", () => {
    render(<SubscribeChrome closeHref="/me" topBack backLabel="Deliveries" />);
    expect(screen.getByRole("button", { name: /Deliveries/i })).toBeInTheDocument();
  });
});
