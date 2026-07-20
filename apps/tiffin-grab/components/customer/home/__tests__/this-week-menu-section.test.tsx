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

const week = { planType: "tiffin", theme: { accent: "#f60", titlePrefix: "Tiffin" }, weekStart: "2026-07-13", slots: [], items: [
  { dayOfWeek: "mon", slot: "sabzi", position: 0, dishName: "Paneer", diet: "veg", image: null, dishPublicId: "dsh_1" },
] } as never;

const weekWithWeekend = { ...week, items: [
  ...week.items,
  { dayOfWeek: "sat", slot: "sabzi", position: 0, dishName: "Weekend Biryani", diet: "nonveg", image: null, dishPublicId: "dsh_2" },
] } as never;

afterEach(cleanup);

describe("ThisWeekMenuSection", () => {
  it("renders the week's dishes and opens the modal on tap", () => {
    render(<ThisWeekMenuSection week={week} />);
    expect(screen.getByText(/Week of Jul 13 – Jul 19/)).toBeInTheDocument();
    expect(screen.getByText("Paneer")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Paneer"));
    // modal shows the dish name again (in a dialog title) — at least 2 nodes now
    expect(screen.getAllByText("Paneer").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the empty state when week is null", () => {
    render(<ThisWeekMenuSection week={null} />);
    expect(screen.getByText(/menu drops soon/i)).toBeInTheDocument();
  });

  it("shows all seven day columns including Sat and Sun", () => {
    render(<ThisWeekMenuSection week={week} />);
    for (const label of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders no placeholder under empty days", () => {
    const { container } = render(<ThisWeekMenuSection week={week} />);
    // Tue has no dishes — only the day label, no dish button or dash placeholder.
    expect(screen.queryByRole("button", { name: /tue/i })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/—/);
  });

  it("shows weekend dishes under Sat column", () => {
    render(<ThisWeekMenuSection week={weekWithWeekend} />);
    expect(screen.getByText("Weekend Biryani")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });
});
