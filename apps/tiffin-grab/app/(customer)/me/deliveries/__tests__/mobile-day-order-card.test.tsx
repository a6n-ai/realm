// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MobileDayOrderCard } from "../mobile-day-order-card";
import type { CalendarCell } from "../calendar-constants";

afterEach(cleanup);

describe("MobileDayOrderCard", () => {
  it("uses meal size as the heading and shows dish chips", () => {
    const cell: CalendarCell = {
      date: "2026-08-19",
      status: "scheduled",
      locked: false,
      isMakeup: false,
      meal: [{ category: "sabzi", picks: [{ name: "Palak Paneer", image: null }] }],
      options: [{ category: "sabzi", dishes: [] }],
      menuWeekId: "week_1",
    } as unknown as CalendarCell;

    render(
      <MobileDayOrderCard
        dateIso="2026-08-19"
        cell={cell}
        delivery={{
          meal: [{ category: "sabzi", picks: [{ name: "Palak Paneer" }] }],
        } as never}
        mealSizeName="Small Thali"
        planName="Weekly Veg"
        tagLabel="Pure Veg"
        tagColor="#1FAE54"
      />,
    );

    expect(screen.getByText("Small Thali")).toBeInTheDocument();
    expect(screen.getByText("Palak Paneer")).toBeInTheDocument();
    expect(screen.getByText("1× Palak Paneer")).toBeInTheDocument();
    expect(screen.getByText("Pure Veg")).toBeInTheDocument();
    expect(screen.queryByText("Weekly Veg")).not.toBeInTheDocument();
  });
});
