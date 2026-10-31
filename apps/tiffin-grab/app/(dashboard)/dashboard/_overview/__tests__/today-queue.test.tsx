// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { TODAY_KINDS, kindOptionLabel, type TodayItem } from "@/lib/today/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../orders/[id]/actions", () => ({ verifyPaymentAction: vi.fn() }));

const { TodayQueue } = await import("../today-queue");

afterEach(cleanup);

const NOW = Date.parse("2026-11-01T12:00:00Z");
const payment = { orderId: "ord_1", paymentId: "pay_1", amount: "50.00", method: "e-Transfer", reference: "REF", proofUrl: null, status: "pending_verification" };
const base = { since: NOW - 2 * 864e5, urgency: 2 as const, href: "/dashboard/orders/ord_1" };

const rows: TodayItem[] = [
  { ...base, kind: "payment", key: "payment:1", who: "Ada Verify", what: "e-Transfer $50.00", payment, canVerify: true },
  { ...base, kind: "payment", key: "payment:2", who: "Bo Card", what: "Card $50.00", payment: { ...payment, paymentId: "pay_2" }, canVerify: false },
  { ...base, kind: "inquiry", key: "inquiry:1", who: "Cy Lead", what: "New lead · Web", urgency: 3, href: "/dashboard/inquiries/inq_1" },
];

const pills = TODAY_KINDS.map((kind) => ({ kind, count: 0 }));

const mount = (over: Partial<Parameters<typeof TodayQueue>[0]> = {}) =>
  render(
    <TimezoneProvider tz="America/Toronto">
      <TodayQueue rows={rows} now={NOW} pills={pills} failed={[]} activeType={null} {...over} />
    </TimezoneProvider>,
  );

describe("kindOptionLabel", () => {
  it("carries the exact total, and reads a clear type as clear", () => {
    expect(kindOptionLabel("payment", 3)).toBe("Payments · 3");
    expect(kindOptionLabel("ticket", 0)).toBe("Tickets · 0 · clear");
    expect(kindOptionLabel("renewal", null)).toBe("Renewals · ?");
  });
});

describe("TodayQueue", () => {
  it("renders a row per item", () => {
    mount();
    for (const name of ["Ada Verify", "Bo Card", "Cy Lead"]) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  });

  it("offers Verify on a row that can be verified", () => {
    mount({ rows: [rows[0]!] });
    expect(screen.getAllByRole("button", { name: "Verify" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("link", { name: "Open" })).toHaveLength(0);
  });

  it("offers only Open on a row that cannot (card payment, inquiry)", () => {
    mount({ rows: rows.slice(1) });
    expect(screen.queryAllByRole("button", { name: "Verify" })).toHaveLength(0);
    const links = new Set(screen.getAllByRole("link", { name: "Open" }).map((a) => a.getAttribute("href")));
    expect(links).toEqual(new Set(["/dashboard/orders/ord_1", "/dashboard/inquiries/inq_1"]));
  });

  it("says nothing is waiting, with a way on to Orders", () => {
    mount({ rows: [] });
    expect(screen.getAllByText("Nothing is waiting. Every list is clear.").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Go to Orders" })[0]!.getAttribute("href")).toBe("/dashboard/orders");
  });

  it("names the type in an empty filtered view and shows a failed source with Retry", () => {
    mount({ rows: [], activeType: "ticket", failed: ["renewal"] });
    expect(screen.getAllByText("Nothing is waiting in Tickets.").length).toBeGreaterThan(0);
    expect(screen.getByRole("alert").textContent).toContain("Renewals");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
