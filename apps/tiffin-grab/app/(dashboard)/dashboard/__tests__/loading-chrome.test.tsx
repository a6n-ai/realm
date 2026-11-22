// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ resource: "plans" }),
}));

afterEach(cleanup);

const show = (ui: ReactElement) => render(<TimezoneProvider tz="America/Toronto">{ui}</TimezoneProvider>);

const headers = () => screen.getAllByRole("columnheader").map((h) => h.textContent);

describe("section loading.tsx paints real chrome", () => {
  it("orders: title, tabs and column headers", async () => {
    const { default: Loading } = await import("../orders/(index)/loading");
    show(<Loading />);
    expect(screen.getByRole("heading", { name: "Orders", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Missed deliveries" })).toBeInTheDocument();
    expect(headers()).toEqual(expect.arrayContaining(["Name", "Status", "Owner", "Start", "Total", "Created"]));
  });

  it("inquiries: title, queue tabs and column headers", async () => {
    const { default: Loading } = await import("../inquiries/(index)/loading");
    show(<Loading />);
    expect(screen.getByRole("heading", { name: "Inquiries", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Due today" })).toBeInTheDocument();
    expect(headers()).toEqual(expect.arrayContaining(["Lead", "Status", "Next follow-up", "Owner", "Last note"]));
  });

  it("payments: tabs and column headers per tab", async () => {
    const { default: Requests } = await import("../payments/requests/loading");
    show(<Requests />);
    expect(screen.getByText("E-transfers")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(3);
  });

  it.each([
    ["customers/(index)", "Customers", ["Customer"]],
    ["tickets/(index)", "Tickets", []],
    ["renewals/(index)", "Renewals", []],
    ["customer-groups/(index)", "Customer groups", []],
  ])("%s: title and column headers", async (dir, title, cols) => {
    const { default: Loading } = await import(`../${dir}/loading`);
    show(<Loading />);
    expect(screen.getByRole("heading", { name: title, level: 1 })).toBeInTheDocument();
    expect(headers().length).toBeGreaterThan(2);
    for (const c of cols) expect(headers()).toContain(c);
  });

  it("customers: Payments tab, search and filter bar come from the shared chrome", async () => {
    const { default: Loading } = await import("../customers/(index)/loading");
    show(<Loading />);
    expect(screen.getByRole("tab", { name: "Payments" })).toHaveAttribute("href", "/dashboard/customers?tab=payments");
    expect(screen.getByPlaceholderText("Search customers…")).toBeDisabled();
    expect(screen.getByRole("button", { name: /add filter/i })).toBeInTheDocument();
  });

  it("renewals: tab hrefs come from renewalsQuery, like the page", async () => {
    const { default: Loading } = await import("../renewals/(index)/loading");
    show(<Loading />);
    expect(screen.getByRole("tab", { name: "Renewals" })).toHaveAttribute("href", "/dashboard/renewals?type=regular");
    expect(screen.getByRole("tab", { name: "Trial conversion" })).toHaveAttribute("href", "/dashboard/renewals?type=trial");
    expect(screen.getByRole("tab", { name: "Renewed customers" })).toHaveAttribute("href", expect.stringContaining("tab=customers"));
  });

  it("tickets and customer-groups: search placeholder and subtitle", async () => {
    const { default: Tickets } = await import("../tickets/(index)/loading");
    show(<Tickets />);
    expect(screen.getByPlaceholderText("Search tickets…")).toBeDisabled();
    cleanup();
    const { default: Groups } = await import("../customer-groups/(index)/loading");
    show(<Groups />);
    expect(screen.getByText(/Saved sets of customers/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search groups…")).toBeDisabled();
  });

  it.each([
    ["settings/holidays/(index)", "Holidays", "Days the kitchen is closed."],
    ["dispatch/(index)", "Dispatch", "Today's routes and driver assignments."],
    ["delivery/charges", "Delivery charges", /Base delivery fee/],
  ])("%s: real page header", async (dir, title, sub) => {
    const { default: Loading } = await import(`../${dir}/loading`);
    show(<Loading />);
    expect(screen.getByRole("heading", { name: title, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(sub)).toBeInTheDocument();
  });

  it("notifications unsubscribed: summary labels and card title", async () => {
    const { default: Loading } = await import("../notifications/unsubscribed/loading");
    show(<Loading />);
    for (const l of ["Unsubscribed", "Bounced", "Complained", "Blocked by staff"]) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
    expect(screen.getByText("Unsubscribed and suppressed")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search addresses…")).toBeDisabled();
  });

  it("notifications activity: own card and columns, not the sends log", async () => {
    const { default: Loading } = await import("../notifications/logs/activity/loading");
    show(<Loading />);
    expect(screen.getByText("Customer activity")).toBeInTheDocument();
    expect(screen.queryByText("Notification log")).toBeNull();
    expect(headers().length).toBeGreaterThan(1);
  });

  it("catalog resource: title from the route segment", async () => {
    const { default: Loading } = await import("../catalog/[resource]/loading");
    show(<Loading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/plans/i);
    expect(screen.getByText("Entries")).toBeInTheDocument();
  });

  it.each([
    ["wallet/balances", "Balances"],
    ["wallet/ledger", "Ledger"],
    ["wallet/give", "Grant history"],
    ["wallet/referrals", "Referrals"],
    ["notifications/campaigns/(index)", "Campaigns"],
    ["notifications/logs/(index)", "Notification log"],
    ["notifications/templates/(index)", "Templates"],
    ["notifications/contact-lists/(index)", "Contact lists"],
    ["organization/roles", "Roles"],
    ["organization/settings/(index)", "Clients"],
    ["settings/logs/(index)", "Activity"],
    ["settings/logs/customers", "Customer activity"],
  ])("%s: card title and real column headers", async (dir, title) => {
    const { default: Loading } = await import(`../${dir}/loading`);
    show(<Loading />);
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(headers().length).toBeGreaterThan(1);
  });
});
