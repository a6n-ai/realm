// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextStepCard } from "./next-step-card";

afterEach(cleanup);

const DAY_START = Date.UTC(2026, 10, 11);
const DAY_END = DAY_START + 86_400_000;
const base = { dayStart: DAY_START, dayEnd: DAY_END, tz: "UTC", pending: false, onPick: vi.fn(), onMarkDone: vi.fn() };

describe("NextStepCard", () => {
  it("calls onMarkDone from Mark done only when a follow-up is scheduled", () => {
    const onMarkDone = vi.fn();
    const { unmount } = render(<NextStepCard {...base} onMarkDone={onMarkDone} nextFollowUpAt={DAY_START + 86_400_000} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect(onMarkDone).toHaveBeenCalledTimes(1);
    unmount();
    render(<NextStepCard {...base} nextFollowUpAt={null} />);
    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
  });

  it("shows a scheduled follow-up with Reschedule and no warning", () => {
    render(<NextStepCard {...base} nextFollowUpAt={DAY_START + 3 * 86_400_000} />);
    expect(screen.getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
    expect(screen.queryByText("No follow-up scheduled")).not.toBeInTheDocument();
  });

  it("flags a missing follow-up with a warning and Set follow-up", () => {
    render(<NextStepCard {...base} nextFollowUpAt={null} />);
    expect(screen.getByText("No follow-up scheduled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set follow-up" })).toBeInTheDocument();
  });

  it("marks an overdue follow-up as overdue", () => {
    render(<NextStepCard {...base} nextFollowUpAt={DAY_START - 2 * 86_400_000} />);
    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
  });
});
