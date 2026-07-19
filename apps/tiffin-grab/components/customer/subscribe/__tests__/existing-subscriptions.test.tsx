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

import { ExistingSubscriptions } from "../existing-subscriptions";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";

const mk = (status: string, name: string, startDate = "2026-07-20") => ({
  publicId: name,
  planName: name,
  mealSizeName: "Medium",
  daysPerWeek: 5,
  status,
  createdAt: 1,
  startDate,
});

afterEach(cleanup);

describe("ExistingSubscriptions", () => {
  it("groups current vs past and renders Manage link", () => {
    render(<ExistingSubscriptions subs={[mk("active", "Veg"), mk("cancelled", "Old")]} />);
    expect(screen.getByText(/Current plan/i)).toBeInTheDocument();
    expect(screen.getByText(/Past subscriptions/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Manage/i }).length).toBeGreaterThan(0);
  });

  it("explains one-plan mode when a live plan exists", () => {
    render(<ExistingSubscriptions subs={[mk("active", "Veg")]} onePlanMode />);
    expect(screen.getByText(/tied to this plan/i)).toBeInTheDocument();
    expect(screen.getByText(/don.?t need a second subscription/i)).toBeInTheDocument();
  });

  it("renders nothing when empty", () => {
    const { container } = render(<ExistingSubscriptions subs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SubscribeChrome", () => {
  it("renders Close linking to closeHref", () => {
    render(<SubscribeChrome closeHref="/me" />);
    expect(screen.getByRole("link", { name: /Close/i })).toHaveAttribute("href", "/me");
    expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument();
  });
});
