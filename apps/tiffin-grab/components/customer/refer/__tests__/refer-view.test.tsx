// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(customer)/me/refer/actions", () => ({ enterReferralCode: vi.fn() }));

import { ReferView } from "../refer-view";

const flat = { mode: "flat" as const, referrerValue: 20, friendValue: 10, maxPerReferrer: null };

afterEach(cleanup);

describe("ReferView", () => {
  it("shows the code, the reward, the total and each friend's status", () => {
    render(
      <ReferView
        summary={{ code: "ABCD2345", settings: flat, totalCoins: 40, friends: [{ name: "Priya S.", status: "rewarded", joinedAt: Date.UTC(2026, 9, 1) }] }}
      />,
    );
    expect(screen.getByText("ABCD2345")).toBeDefined();
    // The offer card, and the same numbers spelled out in the last step.
    expect(screen.getByText("You get")).toBeDefined();
    expect(screen.getByText("Your friend gets")).toBeDefined();
    expect(screen.getByText(/20 coins for you, 10 coins for them/)).toBeDefined();
    expect(screen.getByText("40")).toBeDefined();
    expect(screen.getByText("Earned from friends")).toBeDefined();
    expect(screen.getByText("Priya S.")).toBeDefined();
    expect(screen.getByText("Rewarded")).toBeDefined();
  });

  it("says rewards are paused when both values are 0", () => {
    render(<ReferView summary={{ code: "ABCD2345", settings: { ...flat, referrerValue: 0, friendValue: 0 }, totalCoins: 0, friends: [] }} />);
    expect(screen.getByText(/paused/i)).toBeDefined();
  });

  it("points at sharing when no friend has joined yet", () => {
    render(<ReferView summary={{ code: "ABCD2345", settings: flat, totalCoins: 0, friends: [] }} />);
    expect(screen.getByText(/No friends yet/)).toBeDefined();
  });
});

describe("ReferView code box", () => {
  it("asks a new customer for a friend's code", () => {
    render(<ReferView summary={{ code: "ABCD2345", settings: flat, totalCoins: 0, friends: [], canEnterCode: true }} />);
    expect(screen.getByText(/Got a code from a friend\?/)).toBeDefined();
  });

  it("hides the box once it can't apply", () => {
    render(<ReferView summary={{ code: "ABCD2345", settings: flat, totalCoins: 0, friends: [], canEnterCode: false }} />);
    expect(screen.queryByText(/Got a code from a friend\?/)).toBeNull();
  });
});
