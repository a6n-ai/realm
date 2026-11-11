// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { eq } from "@foundry/commons/model/condition";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { TooltipProvider } from "@foundry/ui/tooltip";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { NextLeadCard, leadScope, type NextLeadCardProps } from "./next-lead-card";

vi.mock("./actions", () => ({
  addNote: vi.fn(async () => ({ ok: true })),
  logActivity: vi.fn(async () => ({ ok: true })),
  updateStatus: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const render = (ui: ReactElement) =>
  rtlRender(
    <TimezoneProvider tz="UTC">
      <TooltipProvider>{ui}</TooltipProvider>
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
    source: "Instagram",
    subStatus: null,
    createdAt: NOW - 3 * 86_400_000,
    nextFollowUpAt: DAY_START + 9 * 3600_000,
    lastNote: "Asked about veg thali",
    ...over,
  }) as unknown as PipelineRow;

const owner = (current: string): NextLeadCardProps["owner"] => ({
  current,
  options: [
    { value: "me", label: "Me", href: "/dashboard/inquiries?leadOwner=me" },
    { value: "all", label: "All owners", href: "/dashboard/inquiries?leadOwner=all" },
    { value: "staff_2", label: "Ravi Shah", href: "/dashboard/inquiries?leadOwner=staff_2" },
  ],
});

const base: Omit<NextLeadCardProps, "lead"> = {
  timeZone: "UTC",
  now: NOW,
  dayStart: DAY_START,
  dayEnd: DAY_END,
  dueCount: 12,
  upcomingCount: 3,
  owner: owner("me"),
  upNext: [],
  upcomingHref: "/dashboard/inquiries?queue=upcoming&owner=me",
  allOpenHref: "/dashboard/inquiries?queue=open&owner=me",
};

afterEach(cleanup);

describe("NextLeadCard", () => {
  it("shows the lead with Call, WhatsApp and Open links", () => {
    render(<NextLeadCard {...base} lead={lead()} />);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/dashboard/inquiries/inq_1");
    expect(screen.getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:4165550123");
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/4165550123");
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/dashboard/inquiries/inq_1");
    expect(screen.getByText("Asked about veg thali")).toBeInTheDocument();
    expect(screen.getByText(/Instagram · created 3d ago/)).toBeInTheDocument();
  });

  it("hides Call and WhatsApp when the lead has no phone", () => {
    render(<NextLeadCard {...base} lead={lead({ phone: null })} />);
    expect(screen.queryByRole("link", { name: /Call|WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByText(/No phone/)).toBeInTheDocument();
  });

  it("badges the follow-up: overdue, due today, later, none", () => {
    const { unmount } = render(<NextLeadCard {...base} lead={lead({ nextFollowUpAt: DAY_START - 2 * 3600_000 })} />);
    expect(screen.getByText(/Overdue · 14h ago/)).toBeInTheDocument();
    unmount();
    const due = render(<NextLeadCard {...base} lead={lead()} />);
    expect(screen.getByText(/^Due /)).toBeInTheDocument();
    due.unmount();
    const later = render(<NextLeadCard {...base} lead={lead({ nextFollowUpAt: DAY_END + 3600_000 })} />);
    expect(screen.getByText("Nov 12, 2026, 1:00 AM")).toBeInTheDocument();
    later.unmount();
    render(<NextLeadCard {...base} lead={lead({ nextFollowUpAt: null })} />);
    expect(screen.getByText("No follow-up")).toBeInTheDocument();
  });

  it("renders Previous and Next as links only when hrefs are given", () => {
    render(<NextLeadCard {...base} lead={lead()} prevHref="/dashboard/inquiries?highlight=a" nextHref="/dashboard/inquiries?highlight=b" />);
    expect(screen.getByRole("link", { name: "Previous lead" })).toHaveAttribute("href", "/dashboard/inquiries?highlight=a");
    expect(screen.getByRole("link", { name: "Next lead" })).toHaveAttribute("href", "/dashboard/inquiries?highlight=b");
    expect(screen.getByText("12 due")).toBeInTheDocument();
  });

  it("renders no Previous or Next link without hrefs", () => {
    render(<NextLeadCard {...base} lead={lead()} />);
    expect(screen.queryByRole("link", { name: /Previous lead|Next lead/ })).not.toBeInTheDocument();
  });

  it("shows the empty state with Upcoming and All open links for the chosen owner", () => {
    render(<NextLeadCard {...base} lead={null} />);
    expect(screen.getByText("No leads due — you're clear.")).toBeInTheDocument();
    expect(screen.getByText("3 upcoming")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upcoming" })).toHaveAttribute("href", "/dashboard/inquiries?queue=upcoming&owner=me");
    expect(screen.getByRole("link", { name: "All open" })).toHaveAttribute("href", "/dashboard/inquiries?queue=open&owner=me");
    expect(screen.queryByRole("link", { name: /Open|Call|Next|Previous/ })).not.toBeInTheDocument();
  });

  it("defaults the owner picker to Me with the Your queue hint", () => {
    render(<NextLeadCard {...base} lead={lead()} />);
    expect(screen.getByText("Your queue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Me/ })).toBeInTheDocument();
  });

  it("names the scope in the hint when it is all owners or one staff member", () => {
    const { unmount } = render(<NextLeadCard {...base} owner={owner("all")} lead={lead()} />);
    expect(screen.getAllByText("All owners").length).toBeGreaterThan(0);
    unmount();
    render(<NextLeadCard {...base} owner={owner("staff_2")} lead={lead()} />);
    expect(screen.getByText("Ravi Shah's queue")).toBeInTheDocument();
  });

  it("lists up to 4 up-next leads, each pinned with highlight and the card's leadOwner", () => {
    const up = ["Bea", "Carl", "Dana", "Eli"].map((name, i) => ({
      ...lead({ publicId: `inq_${i + 2}`, fullName: name, ownerName: "Ravi Shah" }),
      href: `/dashboard/inquiries?leadOwner=all&highlight=inq_${i + 2}`,
    })) as unknown as NextLeadCardProps["upNext"];
    render(<NextLeadCard {...base} owner={owner("all")} lead={lead()} upNext={up} />);
    const rows = up.map((r) => screen.getByRole("link", { name: new RegExp(r.fullName ?? "") }));
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAttribute("href", "/dashboard/inquiries?leadOwner=all&highlight=inq_2");
    expect(rows[3]).toHaveAttribute("href", "/dashboard/inquiries?leadOwner=all&highlight=inq_5");
    expect(screen.getAllByText("Ravi Shah")).toHaveLength(4);
  });

  it("omits the owner name on up-next rows unless the card is all owners", () => {
    const up = [{ ...lead({ publicId: "inq_9", fullName: "Fay", ownerName: "Ravi Shah" }), href: "/dashboard/inquiries?highlight=inq_9" }] as unknown as NextLeadCardProps["upNext"];
    render(<NextLeadCard {...base} lead={lead()} upNext={up} />);
    expect(screen.getByRole("link", { name: /Fay/ })).toBeInTheDocument();
    expect(screen.queryByText("Ravi Shah")).not.toBeInTheDocument();
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
