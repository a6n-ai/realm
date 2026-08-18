// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
