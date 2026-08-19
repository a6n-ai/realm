// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  return { ...actual, useReducedMotion: () => true };
});

import { TiffinTile } from "../tiffin-tile";

afterEach(cleanup);

describe("TiffinTile week", () => {
  it("lets off days be selected so the calendar index stays usable", () => {
    const onClick = vi.fn();
    render(
      <TiffinTile
        variant="week"
        date="2026-08-18"
        status="off"
        dishName={null}
        dishImage={null}
        isToday
        onClick={onClick}
      />,
    );
    const tile = screen.getByRole("button", { name: /Tue 18, today, not scheduled/i });
    expect(tile).toBeEnabled();
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("names upcoming days in the accessible label so they match the legend", () => {
    render(
      <TiffinTile
        variant="week"
        date="2026-08-19"
        status="scheduled"
        dishName={null}
        dishImage={null}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Wed 19, Upcoming/i })).toBeInTheDocument();
  });

  it("circles delivered days in emerald and never shows a lock glyph", () => {
    render(
      <TiffinTile
        variant="week"
        date="2026-08-18"
        status="locked"
        dishName={null}
        dishImage={null}
        onClick={vi.fn()}
      />,
    );
    const tile = screen.getByRole("button", { name: /Tue 18, Delivered/i });
    expect(tile.querySelector("svg")).toBeNull();
    expect(tile.querySelector(".ring-emerald-500")).toHaveTextContent("18");
  });

  it("keeps the Today label when today is delivered, using the emerald circle instead of the today ring", () => {
    render(
      <TiffinTile
        variant="week"
        date="2026-08-19"
        status="locked"
        dishName={null}
        dishImage={null}
        isToday
        onClick={vi.fn()}
      />,
    );
    const tile = screen.getByRole("button", { name: /Wed 19, today, Delivered/i });
    expect(screen.getByText("Today")).toBeInTheDocument();
    const circle = tile.querySelector(".ring-emerald-500");
    expect(circle).toHaveTextContent("19");
    expect(circle).not.toHaveClass("ring-primary");
  });
});

describe("TiffinTile month", () => {
  it("circles delivered days on the month grid without a lock glyph", () => {
    render(
      <TiffinTile
        variant="month"
        date="2026-08-18"
        status="locked"
        dishName={null}
        dishImage={null}
        onClick={vi.fn()}
      />,
    );
    const tile = screen.getByRole("button", { name: /18, Delivered/i });
    expect(tile.querySelector("svg")).toBeNull();
    expect(tile.querySelector(".ring-emerald-500")).toHaveTextContent("18");
  });

  it("keeps the emerald circle unfilled when a delivered day is selected", () => {
    render(
      <TiffinTile
        variant="month"
        date="2026-08-19"
        status="locked"
        dishName={null}
        dishImage={null}
        isToday
        selected
        onClick={vi.fn()}
      />,
    );
    const circle = screen.getByRole("button", { name: /19, today, Delivered/i }).querySelector(".ring-emerald-500");
    expect(circle).toHaveTextContent("19");
    expect(circle).not.toHaveClass("bg-primary");
  });
});
