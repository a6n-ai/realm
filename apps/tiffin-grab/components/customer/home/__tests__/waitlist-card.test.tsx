// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion", () => ({ Lottie: ({ label }: { label?: string }) => <div data-testid="lottie" aria-label={label} /> }));

import { WaitlistCard } from "../waitlist-card";

const base = { publicId: "ord_1", planName: "Veg Tiffin", mealSizeName: "Medium", daysPerWeek: 5, fullName: "A", addressLine: "1 St", city: "Toronto", postalCode: "M4B 1B3" };

afterEach(cleanup);

describe("WaitlistCard", () => {
  it("shows waitlist copy + order summary for a waitlisted order", () => {
    render(<WaitlistCard sub={{ ...base, status: "waitlisted" }} />);
    expect(screen.getByText(/on the waitlist/i)).toBeInTheDocument();
    expect(screen.getByText(/Veg Tiffin/)).toBeInTheDocument();
    expect(screen.getByText(/Medium/)).toBeInTheDocument();
    expect(screen.getByText(/M4B 1B3/)).toBeInTheDocument();
  });

  it("shows a processing variant for a pending order", () => {
    render(<WaitlistCard sub={{ ...base, status: "pending" }} />);
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
  });
});
