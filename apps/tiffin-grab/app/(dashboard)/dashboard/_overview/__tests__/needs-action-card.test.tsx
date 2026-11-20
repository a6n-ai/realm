// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/today/today.service", () => ({
  getTodayCounts: async () => ({
    byKind: { payment: 0, missed: 0, ticket: 0, renewal: 0, lookout: 0, inquiry: 0 },
    toVerify: 0,
    openTickets: 0,
    overdueTickets: 0,
    endingPlans: 0,
    missed: 0,
  }),
  listReviewPayments: async () => [],
}));
vi.mock("@/lib/optimoroute/config", () => ({ getOptimoRouteStatus: async () => ({ installed: false, hasApiKey: false }) }));
vi.mock("@/lib/optimoroute/push-status", () => ({ nextRoutePushStatus: async () => null }));
vi.mock("@/lib/menu/menu.service", () => ({ menuService: { listWeeks: async () => [] } }));
vi.mock("../push-day-button", () => ({ PushDayButton: () => null }));
vi.mock("../verify-payment-button", () => ({ VerifyPaymentButton: () => null }));

const { NeedsActionCard } = await import("../needs-action-card");

afterEach(cleanup);

describe("NeedsActionCard", () => {
  it("marks a clear area with a tone badge and no icon", async () => {
    const perms = { orders: true, delivery: false, payments: false, tickets: false, menus: false, editMenus: false };
    render(await NeedsActionCard({ visible: "all", today: "2026-11-20", seesAll: false, perms }));
    const clear = screen.getAllByText("clear");
    expect(clear).toHaveLength(2);
    for (const badge of clear) expect(badge.querySelector("svg")).toBeNull();
  });
});
