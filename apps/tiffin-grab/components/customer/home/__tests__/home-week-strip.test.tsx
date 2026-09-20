// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { HomeWeekStrip, HomeWeekStripEmpty } from "../home-week-strip";
import { buildTrips } from "@/lib/deliveries-view";

afterEach(cleanup);

const plan = { cutoffHour: 18, timezone: "America/Toronto", pooled: 0, lastDeliveryDate: null, deliveryWeekdays: [] };
const trips = buildTrips(
  [{ date: "2026-07-20", status: "scheduled", locked: false, isMakeup: false }],
  Date.parse("2026-07-19T12:00:00Z"),
  plan,
);

describe("HomeWeekStrip", () => {
  it("links a delivery day to its trip and dims empty days", () => {
    render(<HomeWeekStrip trips={trips} todayIso="2026-07-19" />);
    expect(screen.getByRole("link", { name: /Full calendar/i })).toHaveAttribute("href", "/me/deliveries");
    fireEvent.click(screen.getByRole("button", { name: /July 20.*Upcoming/ }));
    expect(push).toHaveBeenCalledWith("/me/deliveries?trip=2026-07-20");
    expect(screen.getByRole("button", { name: /July 21.*unavailable/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("empty state links to subscribe", () => {
    render(<HomeWeekStripEmpty />);
    expect(screen.getByRole("link", { name: /Browse plans/i })).toHaveAttribute("href", "/subscribe");
  });
});
