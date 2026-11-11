// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen, within } from "@testing-library/react";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { TooltipProvider } from "@foundry/ui/tooltip";
import type { NextRenewalRow } from "@/lib/services/next-renewal.service";
import { NextRenewalCard, type NextRenewalCardProps } from "./next-renewal-card";

vi.mock("./actions", () => ({
  addNote: vi.fn(async () => ({ ok: true })),
  logActivity: vi.fn(async () => ({ ok: true })),
  updateStatus: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../renewals/actions", () => ({
  setTrackStatusAction: vi.fn(async () => ({ ok: true })),
  addTrackNoteAction: vi.fn(async () => ({ ok: true })),
  logTrackActivityAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/inquiries",
  useSearchParams: () => new URLSearchParams(),
}));

const render = (ui: ReactElement) =>
  rtlRender(
    <TimezoneProvider tz="America/Toronto">
      <TooltipProvider>{ui}</TooltipProvider>
    </TimezoneProvider>,
  );

const TODAY = "2026-11-11";
const row = (over: Partial<NextRenewalRow> = {}): NextRenewalRow => ({
  orderPublicId: "ord_1", customerPublicId: "cus_1", code: "A1", customerName: "Asha Rao", phone: "+16475550001",
  planName: "Plan", mealSize: "Regular", lastTiffin: "2026-11-20", planTotal: "100", status: "none", trial: false,
  track: null, trackSource: null, lostReason: null, nextFollowUpAt: null, lastActivity: null,
  priorPlans: 0, holds: 0, openTickets: 0, walletCoins: 0, totalSpent: "0", prevOrderTotal: null, reason: "renew", ...over,
});

const base: Omit<NextRenewalCardProps, "row" | "upNext"> = {
  today: TODAY,
  queueCount: 7,
  owner: { current: "me", options: [{ value: "me", label: "Me", href: "/dashboard/inquiries?view=renewals&renewalOwner=me" }] },
  renewQueueHref: "/dashboard/inquiries?view=renewals&queue=renew",
};

afterEach(cleanup);

describe("NextRenewalCard", () => {
  it.each([
    ["overdue", row({ reason: "overdue" }), /^Follow-up overdue$/],
    ["due", row({ reason: "due" }), /^Due today$/],
    ["renew, still ending", row({ reason: "renew", lastTiffin: "2026-11-20" }), /^Ends /],
    ["renew, lapsed", row({ reason: "renew", lastTiffin: "2026-11-01" }), /^Lapsed /],
  ])("shows the %s badge", (_, r, label) => {
    render(<NextRenewalCard {...base} row={r} upNext={[]} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("links the customer to the Inquiries renewal page, with Call and WhatsApp", () => {
    render(<NextRenewalCard {...base} row={row()} upNext={[]} />);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/dashboard/inquiries/renewals/cus_1");
    expect(screen.getByRole("link", { name: /Call Asha Rao/ })).toHaveAttribute("href", "tel:+16475550001");
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/16475550001");
    expect(screen.getByRole("link", { name: "Open customer" })).toHaveAttribute("href", "/dashboard/inquiries/renewals/cus_1");
  });

  it("offers Add note but hides Set follow-up for a closed plan", () => {
    render(<NextRenewalCard {...base} row={row({ track: "renewed", trackSource: "staff" })} upNext={[]} />);
    expect(screen.getByRole("button", { name: "Add note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set follow-up" })).toBeNull();
  });

  it("shows Set follow-up for an open plan", () => {
    render(<NextRenewalCard {...base} row={row({ track: "follow_up", trackSource: "staff" })} upNext={[]} />);
    expect(screen.getByRole("button", { name: "Set follow-up" })).toBeInTheDocument();
  });

  it("gives a customer without an account no status or note actions, only Open the order", () => {
    render(<NextRenewalCard {...base} row={row({ customerPublicId: null, phone: null })} upNext={[]} />);
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set follow-up" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open order" })).toHaveAttribute("href", "/dashboard/orders/ord_1");
  });

  it("up next shows at most six plans, each linking to its renewal page", () => {
    const upNext = Array.from({ length: 8 }, (_, i) => row({ orderPublicId: `ord_${i + 2}`, customerPublicId: `cus_${i + 2}`, customerName: `Customer ${i + 2}` }));
    render(<NextRenewalCard {...base} row={row()} upNext={upNext.slice(0, 6)} />);
    const strip = within(screen.getByRole("region", { name: "Up next renewals" }));
    const names = strip.getAllByRole("link", { name: /^Customer / });
    expect(names).toHaveLength(6);
    expect(names[0]).toHaveAttribute("href", "/dashboard/inquiries/renewals/cus_2");
    expect(strip.getByRole("link", { name: "Customer 7" })).toHaveAttribute("href", "/dashboard/inquiries/renewals/cus_7");
  });

  it("with nothing to act on, says so and links to the To renew queue", () => {
    render(<NextRenewalCard {...base} row={null} upNext={[]} />);
    expect(screen.getByText("No renewals need attention.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "To renew" })).toHaveAttribute("href", base.renewQueueHref);
  });
});
