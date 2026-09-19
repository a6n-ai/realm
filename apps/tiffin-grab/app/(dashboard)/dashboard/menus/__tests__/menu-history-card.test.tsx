// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { MenuHistoryCard } from "../menu-history-card";
import type { MealSlot } from "@/lib/menu/meal-types";
import type { PosterItem } from "@/lib/menu/poster";

const slots: MealSlot[] = [
  { key: "sabzi", label: "Sabzi" },
  { key: "rice", label: "Rice" },
];

const items: PosterItem[] = [
  { dayOfWeek: "mon", slot: "sabzi", dishName: "Paneer Butter Masala", position: 0 },
  { dayOfWeek: "mon", slot: "rice", dishName: "Jeera Rice", position: 0 },
  { dayOfWeek: "sat", slot: "sabzi", dishName: "Weekend Biryani", position: 0 },
];

const week = {
  publicId: "mnw_1",
  weekStart: "2026-09-21",
  status: "released",
  releasedAt: Date.UTC(2026, 8, 18),
  itemCount: items.length,
  slots,
  items,
};

function renderCard(props: Partial<ComponentProps<typeof MenuHistoryCard>> = {}) {
  return render(
    <TimezoneProvider tz="America/Toronto">
      <MenuHistoryCard week={week} accent="#F0820A" highlight="upcoming" {...props} />
    </TimezoneProvider>,
  );
}

afterEach(cleanup);

describe("MenuHistoryCard", () => {
  it("shows the whole week as Mon–Sun columns, not a day carousel", () => {
    renderCard();
    for (const label of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /previous day/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next day/i })).not.toBeInTheDocument();
  });

  it("lists dishes under their day and category, with empty days as labels only", () => {
    const { container } = renderCard();
    expect(screen.getByText("Paneer Butter Masala")).toBeInTheDocument();
    expect(screen.getByText("Jeera Rice")).toBeInTheDocument();
    expect(screen.getByText("Weekend Biryani")).toBeInTheDocument();
    expect(screen.getAllByText("Sabzi").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Weekends")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/—/);
  });

  it("links Edit week to the builder and marks the live week", () => {
    renderCard({ highlight: "current", todayKey: "mon" });
    expect(screen.getByRole("link", { name: /edit week/i })).toHaveAttribute("href", "/dashboard/menus/mnw_1");
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();
  });
});
