// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
const card = vi.hoisted(() => ({ value: null as unknown, fail: false }));
vi.mock("@/lib/inquiries/inquiry-links.service", () => ({
  inquiryOrderCard: async () => {
    if (card.fail) throw new Error("db down");
    return card.value;
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
vi.mock("@/lib/auth/visible-orgs", () => ({ resolveSessionVisibleOrgIds: async () => "all" }));

const { OrderInquiryCard } = await import("../order-inquiry-card");

afterEach(() => {
  cleanup();
  card.value = null;
  card.fail = false;
});

describe("OrderInquiryCard", () => {
  it("shows the linked inquiry with its round", async () => {
    card.value = { publicId: "inq_1", fullName: "Asha Rao", ownerName: "Priya", stage: "converted", renewalStatus: "follow_up", nextFollowUpAt: null, roundLabel: "Renewal 1" };
    render(await OrderInquiryCard({ orderId: 1n, orderPublicId: "ord_1", timezone: "UTC" }));
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("Renewal 1")).toBeInTheDocument();
    expect(screen.getByText("Priya")).toBeInTheDocument();
  });

  it("shows an empty state when no inquiry is linked", async () => {
    render(await OrderInquiryCard({ orderId: 1n, orderPublicId: "ord_1", timezone: "UTC" }));
    expect(screen.getByText("No inquiry linked")).toBeInTheDocument();
  });

  it("shows an inline error with a retry link", async () => {
    card.fail = true;
    render(await OrderInquiryCard({ orderId: 1n, orderPublicId: "ord_1", timezone: "UTC" }));
    expect(screen.getByText("Couldn't load the inquiry.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retry" })).toHaveAttribute("href", "/dashboard/orders/ord_1");
  });
});
