// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

import { ExpiryBadge } from "../stripe-table";

afterEach(cleanup);
const now = Date.UTC(2026, 9, 21);

describe("ExpiryBadge", () => {
  it("shows Void for a voided link (rejected, expiresAt 0)", () => {
    render(<ExpiryBadge r={{ isAddon: true, expiresAt: 0, status: "rejected" }} now={now} tz="America/Toronto" />);
    expect(screen.getByText("Void")).toBeInTheDocument();
  });

  it("shows Refund needed when a void link was charged anyway", () => {
    render(<ExpiryBadge r={{ isAddon: true, expiresAt: 0, status: "paid" }} now={now} tz="America/Toronto" />);
    expect(screen.getByText("Refund needed")).toBeInTheDocument();
  });

  it("shows Expired for an unpaid link past its expiry", () => {
    render(<ExpiryBadge r={{ isAddon: false, expiresAt: now - 1, status: "awaiting_payment" }} now={now} tz="America/Toronto" />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });
});
