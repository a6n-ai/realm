import { describe, expect, it } from "vitest";
import { ticketsListHref } from "../tickets-drill";

describe("tickets drill", () => {
  it("keeps the date range and an optional status, including the overdue pill", () => {
    expect(ticketsListHref({ from: "10", to: "20" })).toBe("/dashboard/tickets?from=10&to=20");
    expect(ticketsListHref({ from: "10", to: "20" }, { status: "open,in_progress,waiting_on_customer" })).toBe(
      "/dashboard/tickets?from=10&to=20&status=open%2Cin_progress%2Cwaiting_on_customer",
    );
    expect(ticketsListHref({}, { status: "overdue" })).toBe("/dashboard/tickets?status=overdue");
  });
});
