// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
  Pressable: ({ children, ...p }: { children: React.ReactNode } & Record<string, unknown>) => <button {...(p as object)}>{children}</button>,
  LottieEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { ThisWeekMenuSection } from "../this-week-menu-section";
import type { menuService } from "@/lib/services/menu.service";

type Week = NonNullable<Awaited<ReturnType<typeof menuService.getPublishedWeek>>>;

const week = {
  planType: "tiffin",
  theme: { accent: "#f60", titlePrefix: "Tiffin" },
  weekStart: "2026-07-13",
  slots: [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 1, tuUnitType: "weight", tuUnitSize: "8", tuUnitLabel: "oz" }],
  items: [
    {
      dayOfWeek: "mon",
      slot: "sabzi",
      position: 0,
      dishName: "Paneer Butter Masala",
      image: null,
      dishPublicId: "dsh_1",
    },
  ],
} as Week;

const weekWithWeekend = {
  ...week,
  items: [
    ...week.items,
    {
      dayOfWeek: "sat",
      slot: "sabzi",
      position: 0,
      dishName: "Weekend Biryani",
      image: null,
      dishPublicId: "dsh_2",
    },
  ],
} as Week;

afterEach(cleanup);

describe("ThisWeekMenuSection", () => {
  it("renders the week's dishes and opens the modal on tap", () => {
    render(<ThisWeekMenuSection week={week} />);
    expect(screen.getByText(/Jul 13 – Jul 19/)).toBeInTheDocument();
    expect(screen.getByText("Paneer Butter Masala")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Paneer Butter Masala"));
    expect(screen.getAllByText("Paneer Butter Masala").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the empty state when week is null", () => {
    render(<ThisWeekMenuSection week={null} />);
    expect(screen.getByText(/No menu released yet/i)).toBeInTheDocument();
  });

  it("shows all seven day names including Sat and Sun", () => {
    render(<ThisWeekMenuSection week={week} />);
    for (const label of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders no placeholder under empty days", () => {
    const { container } = render(<ThisWeekMenuSection week={week} />);
    expect(screen.queryByRole("button", { name: /tuesday/i })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/—/);
  });

  it("shows weekend dishes under Saturday", () => {
    render(<ThisWeekMenuSection week={weekWithWeekend} />);
    expect(screen.getByText("Weekend Biryani")).toBeInTheDocument();
    expect(screen.getByText("Saturday")).toBeInTheDocument();
  });

  it("labels an upcoming released week as next week", () => {
    render(<ThisWeekMenuSection week={week} scope="next" />);
    expect(screen.getByText("Next week's menu")).toBeInTheDocument();
  });

  it("does not truncate a long dish name in the card", () => {
    render(<ThisWeekMenuSection week={week} />);
    const name = screen.getByText("Paneer Butter Masala");
    expect(name.className).not.toMatch(/truncate/);
  });
});
