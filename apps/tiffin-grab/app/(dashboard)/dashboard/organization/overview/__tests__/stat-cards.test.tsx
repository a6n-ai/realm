// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCards } from "../stat-cards";

describe("StatCards", () => {
  it("renders franchise, staff, and pending-invite counts", () => {
    render(<StatCards franchiseCount={3} staffCount={12} pendingInviteCount={2} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
