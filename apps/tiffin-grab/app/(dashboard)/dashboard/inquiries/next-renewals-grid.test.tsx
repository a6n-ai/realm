// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { TooltipProvider } from "@foundry/ui/tooltip";
import type { NextRenewalRow } from "@/lib/services/next-renewal.service";
import { NextRenewalsGrid, type NextRenewalsGridProps } from "./next-renewals-grid";

vi.mock("../renewals/estimate-button", () => ({ EstimateButton: () => <button type="button">Estimate</button> }));
vi.mock("../renewals/_track/track-status", () => ({ TrackStatusMenu: () => <span>Status</span> }));
vi.mock("./renewals-queue-list", () => ({ RowTrackActions: () => <button type="button">Add note</button> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const render = (ui: ReactElement) =>
  rtlRender(
    <TimezoneProvider tz="UTC">
      <TooltipProvider>{ui}</TooltipProvider>
    </TimezoneProvider>,
  );

const TODAY = "2026-11-12";

const plan = (over: Partial<NextRenewalRow> = {}) =>
  ({
    orderPublicId: "ord_1",
    customerPublicId: "cus_1",
    customerName: "Asha Rao",
    phone: "+14165550123",
    trial: false,
    track: "open",
    trackSource: "auto",
    mealSize: "Medium",
    lastTiffin: "2026-11-20",
    lastActivity: null,
    reason: "renew",
    ...over,
  }) as unknown as NextRenewalRow;

const base: Omit<NextRenewalsGridProps, "rows"> = {
  toAct: 7,
  owner: { current: "me", options: [{ value: "me", label: "Me", href: "/dashboard/inquiries?view=renewals&renewalOwner=me" }] },
  today: TODAY,
  viewAllHref: "/dashboard/inquiries?view=renewals&queue=renew",
};

afterEach(cleanup);

describe("NextRenewalsGrid", () => {
  it("shows each plan as a card linking to the customer's renewal page, with the to-act count", () => {
    render(<NextRenewalsGrid {...base} rows={[plan()]} />);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/dashboard/inquiries/renewals/cus_1");
    expect(screen.getByText(/7 to act on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View all/ })).toHaveAttribute("href", base.viewAllHref);
    expect(screen.getByRole("button", { name: "Estimate" })).toBeInTheDocument();
  });

  it("links a customer without an account to the order", () => {
    render(<NextRenewalsGrid {...base} rows={[plan({ customerPublicId: null })]} />);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/dashboard/orders/ord_1");
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
  });

  it("shows the empty state with a link to the renewal queue when nothing needs action", () => {
    render(<NextRenewalsGrid {...base} toAct={0} rows={[]} />);
    expect(screen.getByText("No renewals need attention.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "To renew" })).toHaveAttribute("href", base.viewAllHref);
  });

  it("shows the error in place of the grid", () => {
    render(<NextRenewalsGrid {...base} rows={[]} error="Something went wrong loading your renewals. Try again." />);
    expect(screen.getByText("Something went wrong loading your renewals. Try again.")).toBeInTheDocument();
  });
});
