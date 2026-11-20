// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/analytics",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const TABS: Record<string, string[]> = {
  overview: ["Net revenue by day", "Revenue mix", "What share of trials became a plan?", "Customer status", "Day by day"],
  leads: ["Lead stages", "Where each source's leads went", "Source performance", "Lost reasons", "Renewals by round"],
  revenue: ["Net revenue by day", "Revenue calendar", "How much is still owed?", "Payments", "Discounts given", "Free tiffins"],
  profitability: ["Day by day", "Profit by day", "Where the money goes", "Orders by week"],
  products: ["Sales by plan and size", "Which meal size tier earns the most?", "Which sizes sell in which diet?", "Veg or non-veg?", "Add-ons sold", "How long do they buy for?"],
  customers: ["Signups by day", "Signups calendar", "Subscription status", "Top cities"],
  operations: ["Deliveries calendar", "Route load per driver", "What share of deliveries was skipped?", "Delivery status"],
  complaints: ["Complaints calendar", "By delivery zone", "By category", "By sub-category", "Status", "By plan", "Customers with repeat complaints"],
  employees: ["Reps ranked by revenue", "Revenue by rep", "Workload mix", "Leads worked per rep", "Tickets resolved per rep", "Per-rep breakdown"],
};

describe.each(Object.entries(TABS))("analytics/%s loading", (tab, titles) => {
  it("paints every chart title of the real page", async () => {
    const { default: Loading } = await import(`../${tab}/loading`);
    render(<Loading />);
    for (const t of titles) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
  });

  it("uses titles the page really renders", () => {
    const src = readFileSync(join(__dirname, `../${tab}/page.tsx`), "utf8");
    for (const t of titles) expect(src).toContain(t.endsWith(" by day") ? t.slice(0, -3) : t);
  });
});
