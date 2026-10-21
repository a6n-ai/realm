// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/You get 20 coins/)).toBeDefined();
    expect(screen.getByText(/40 coins earned/)).toBeDefined();
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
