// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({ useReducedMotion: () => true }));

import { CutoffBanner } from "../cutoff-banner";

const NOW = 1_000_000_000_000;
afterEach(cleanup);

describe("CutoffBanner", () => {
  it("counts down to the soonest still-editable cutoff", () => {
    const days = [
      { dateIso: "2026-07-14", dayOfWeek: "mon", lockMs: NOW - 1000 },       // passed
      { dateIso: "2026-07-15", dayOfWeek: "tue", lockMs: NOW + 4 * 3600_000 + 12 * 60_000 }, // 4h12m
    ];
    render(<CutoffBanner days={days} now={NOW} />);
    expect(screen.getByText(/4h 12m/)).toBeInTheDocument();
    expect(screen.getByText(/Tue/i)).toBeInTheDocument();
  });

  it("shows the locked message when every day is past cutoff", () => {
    const days = [{ dateIso: "2026-07-14", dayOfWeek: "mon", lockMs: NOW - 1000 }];
    render(<CutoffBanner days={days} now={NOW} />);
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });
});
