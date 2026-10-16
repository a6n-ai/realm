// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { MenuWeekRow } from "../menu-history-card";

const week = {
  publicId: "mnw_1",
  weekStart: "2026-09-21",
  status: "released",
  releasedAt: Date.UTC(2026, 8, 18),
  itemCount: 3,
};

function renderRow(props: Partial<ComponentProps<typeof MenuWeekRow>> = {}) {
  return render(
    <TimezoneProvider tz="America/Toronto">
      <ul><MenuWeekRow week={week} highlight="current" {...props} /></ul>
    </TimezoneProvider>,
  );
}

afterEach(cleanup);

describe("MenuWeekRow", () => {
  it("names the week, where it stands and how full it is, and opens the builder", () => {
    renderRow();
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();
    expect(screen.getByText(/3 dishes · Released/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Open / })).toHaveAttribute("href", "/dashboard/menus/mnw_1");
  });

  it("a draft reads Draft and has no release date", () => {
    renderRow({ week: { ...week, status: "draft", releasedAt: null }, highlight: null });
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByText("This week")).not.toBeInTheDocument();
    expect(screen.queryByText(/Released/)).not.toBeInTheDocument();
  });
});
