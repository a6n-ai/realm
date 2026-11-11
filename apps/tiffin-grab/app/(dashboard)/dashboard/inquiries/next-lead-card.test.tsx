// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { TooltipProvider } from "@foundry/ui/tooltip";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { NextLeadCard } from "./next-lead-card";

vi.mock("./actions", () => ({
  addNote: vi.fn(async () => ({ ok: true })),
  logActivity: vi.fn(async () => ({ ok: true })),
  updateStatus: vi.fn(async () => ({ ok: true })),
}));

const render = (ui: ReactElement) =>
  rtlRender(
    <TimezoneProvider tz="UTC">
      <TooltipProvider>{ui}</TooltipProvider>
    </TimezoneProvider>,
  );

const DAY_START = Date.UTC(2026, 10, 11);
const lead = (over: Partial<PipelineRow> = {}) =>
  ({
    publicId: "inq_1",
    fullName: "Asha Rao",
    phone: "4165550123",
    subStatus: null,
    nextFollowUpAt: DAY_START + 9 * 3600_000,
    lastNote: "Asked about veg thali",
    ...over,
  }) as unknown as PipelineRow;

const base = { timeZone: "UTC", dayStart: DAY_START, allOpenHref: "/dashboard/inquiries?owner=all&queue=open" };

afterEach(cleanup);

describe("NextLeadCard", () => {
  it("shows the lead with a Call link and Open link", () => {
    render(<NextLeadCard {...base} lead={lead()} />);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/dashboard/inquiries/inq_1");
    expect(screen.getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:4165550123");
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/dashboard/inquiries/inq_1");
    expect(screen.getByText("Asked about veg thali")).toBeInTheDocument();
  });

  it("hides Call when the lead has no phone", () => {
    render(<NextLeadCard {...base} lead={lead({ phone: null })} />);
    expect(screen.queryByRole("link", { name: /Call/ })).not.toBeInTheDocument();
    expect(screen.getByText("No phone")).toBeInTheDocument();
  });

  it("renders Previous and Next only when hrefs are given", () => {
    render(<NextLeadCard {...base} lead={lead()} prevHref="/dashboard/inquiries?highlight=a" nextHref="/dashboard/inquiries?highlight=b" />);
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "/dashboard/inquiries?highlight=a");
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/dashboard/inquiries?highlight=b");
  });

  it("shows the empty state with a link to all open leads", () => {
    render(<NextLeadCard {...base} lead={null} />);
    expect(screen.getByText("No leads due. You're clear.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All open" })).toHaveAttribute("href", "/dashboard/inquiries?owner=all&queue=open");
    expect(screen.queryByRole("link", { name: /Open|Call|Next|Previous/ })).not.toBeInTheDocument();
  });
});
