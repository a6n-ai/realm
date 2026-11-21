// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import type { NextRenewalRow } from "@/lib/renewals/next-renewal.service";
import { NextRenewalsGrid, type NextRenewalsGridProps } from "./next-renewals-grid";

vi.mock("../_order/estimate-dialog", () => ({ EstimateDialog: ({ fromOrder }: { fromOrder: string }) => <div role="dialog">Estimate {fromOrder}</div> }));
vi.mock("../renewals/_track/track-status", () => ({ TrackStatusMenu: () => <span>Status</span> }));
vi.mock("../renewals/_track/track-note-dialog", () => ({ TrackNoteDialog: ({ kind }: { kind: string }) => <div role="dialog">Track {kind}</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const render = (ui: ReactElement) =>
  rtlRender(
    <TimezoneProvider tz="UTC">
      {ui}
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
  it("shows each plan as one row: avatar, name link to the renewal page, status, Call and Estimate beside them and the rest in More actions", async () => {
    const { container } = render(<NextRenewalsGrid {...base} rows={[plan()]} />);
    expect(container.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/dashboard/inquiries/renewals/cus_1");
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText(/7 to act on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View all/ })).toHaveAttribute("href", base.viewAllHref);
    expect(screen.getByRole("link", { name: /Call Asha Rao/ })).toHaveAttribute("href", "tel:+14165550123");
    expect(screen.getByRole("button", { name: "Estimate" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Note" })).toBeNull();

    fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: /^WhatsApp / })).toHaveAttribute("href", "https://wa.me/14165550123");
    expect(screen.getByRole("menuitem", { name: "Note" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Follow-up" })).toBeInTheDocument();
  });

  it("opens the estimate and the note dialogs from their actions", async () => {
    render(<NextRenewalsGrid {...base} rows={[plan()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Estimate" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Estimate ord_1");
    cleanup();
    render(<NextRenewalsGrid {...base} rows={[plan()]} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Note" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Track note");
  });

  it("hides Follow-up for a closed plan", async () => {
    render(<NextRenewalsGrid {...base} rows={[plan({ track: "renewed" })]} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: "Note" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Follow-up" })).toBeNull();
  });

  it("links a customer without an account to the order and offers no note or follow-up", async () => {
    render(<NextRenewalsGrid {...base} rows={[plan({ customerPublicId: null })]} />);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/dashboard/orders/ord_1");
    fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: /^WhatsApp / })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Note" })).toBeNull();
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
