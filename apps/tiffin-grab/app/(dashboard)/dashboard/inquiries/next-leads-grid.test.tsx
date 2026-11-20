// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { eq } from "@foundry/commons/model/condition";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import type { PipelineRow } from "@/lib/inquiries/inquiries.service";
import { NextLeadsGrid, leadScope, type NextLeadsGridProps } from "./next-leads-grid";

vi.mock("./actions", () => ({
  addNote: vi.fn(async () => ({ ok: true })),
  logActivity: vi.fn(async () => ({ ok: true })),
  updateStatus: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const render = (ui: ReactElement) =>
  rtlRender(
    <TimezoneProvider tz="UTC">
      {ui}
    </TimezoneProvider>,
  );

const DAY_START = Date.UTC(2026, 10, 11);
const DAY_END = DAY_START + 86_400_000;
const NOW = DAY_START + 12 * 3600_000;

const lead = (over: Partial<PipelineRow> = {}) =>
  ({
    publicId: "inq_1",
    fullName: "Asha Rao",
    phone: "4165550123",
    email: null,
    whatsappPhone: null,
    source: "Instagram",
    subStatus: null,
    createdAt: NOW - 3 * 86_400_000,
    nextFollowUpAt: DAY_START + 9 * 3600_000,
    ...over,
  }) as unknown as PipelineRow;

const base: Omit<NextLeadsGridProps, "leads"> = {
  toAct: 12,
  owner: { current: "me", options: [{ value: "me", label: "Me", href: "/dashboard/inquiries?leadOwner=me" }] },
  viewAllHref: "/dashboard/inquiries?queue=open&owner=me",
  upcomingHref: "/dashboard/inquiries?queue=upcoming&owner=me",
  timeZone: "UTC",
  now: NOW,
  dayStart: DAY_START,
  dayEnd: DAY_END,
};

afterEach(cleanup);

describe("NextLeadsGrid", () => {
  it("shows each lead as a row: its name links to the lead, Call and Log outcome sit beside it, and the rest is in More actions", async () => {
    render(<NextLeadsGrid {...base} leads={[lead()]} />);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/dashboard/inquiries/inq_1");
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
    expect(screen.getByRole("link", { name: /Call Asha Rao/ })).toHaveAttribute("href", "tel:4165550123");
    expect(screen.getByRole("button", { name: "Log outcome" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
    expect(screen.getByText("12 to act on", { exact: false })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: "Message" })).toHaveAttribute("href", "https://wa.me/4165550123");
    expect(screen.getByRole("menuitem", { name: "Note" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Follow-up" })).toBeInTheDocument();
  });

  it("hides Follow-up in More actions for a closed lead", async () => {
    render(<NextLeadsGrid {...base} leads={[lead({ subStatus: "lost" })]} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: "Note" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Follow-up" })).toBeNull();
  });

  it("shows the no-phone state as text and no Call or Message", async () => {
    render(<NextLeadsGrid {...base} leads={[lead({ phone: null })]} />);
    expect(screen.getByText(/No phone/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Call Asha Rao/ })).toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: "Note" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Message" })).toBeNull();
  });

  it("shows the empty state with Upcoming and All open links when nothing is due", () => {
    render(<NextLeadsGrid {...base} toAct={0} leads={[]} />);
    expect(screen.getByText("No leads due. You're clear.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upcoming" })).toHaveAttribute("href", base.upcomingHref);
  });

  it("shows the inline error with Retry in place of the leads", () => {
    render(<NextLeadsGrid {...base} leads={[]} error="Something went wrong loading your leads. Try again." />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });
});

describe("leadScope", () => {
  it("defaults to the viewer's own leads", () => {
    expect(leadScope(undefined, "viewer_1")).toEqual(eq("owner", "viewer_1"));
    expect(leadScope("me", "viewer_1")).toEqual(eq("owner", "viewer_1"));
  });

  it("has no owner condition for all owners", () => {
    expect(leadScope("all", "viewer_1")).toBeUndefined();
  });

  it("scopes to one staff member", () => {
    expect(leadScope("staff_2", "viewer_1")).toEqual(eq("owner", "staff_2"));
  });
});
