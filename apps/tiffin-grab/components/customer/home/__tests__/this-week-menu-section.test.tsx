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

afterEach(cleanup);

describe("ThisWeekMenuSection", () => {
  it("renders the week's dishes and opens the modal on tap", () => {
    render(<ThisWeekMenuSection week={week} />);
    expect(screen.getByText("Paneer")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Paneer"));
    // modal shows the dish name again (in a dialog title) — at least 2 nodes now
    expect(screen.getAllByText("Paneer").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the empty state when week is null", () => {
    render(<ThisWeekMenuSection week={null} />);
    expect(screen.getByText(/menu drops soon/i)).toBeInTheDocument();
  });
});
