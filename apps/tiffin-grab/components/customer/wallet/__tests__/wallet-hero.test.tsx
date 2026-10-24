// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/motion", () => ({
  AnimatedNumber: ({ value, format }: { value: number; format?: (n: number) => string }) => <span>{format ? format(value) : String(value)}</span>,
}));
import { WalletHero } from "../wallet-hero";
afterEach(cleanup);
describe("WalletHero", () => {
  it("shows coins and money value", () => {
    render(<WalletHero coins={1240} money={12.4} currency="USD" />);
    expect(screen.getByText("1240")).toBeInTheDocument();
    expect(screen.getByText(/\$12\.40/)).toBeInTheDocument();
  });
  it("hides money when null", () => {
    render(<WalletHero coins={1240} money={null} currency="INR" />);
    expect(screen.queryByText(/\$/)).toBeNull();
  });
});
describe("WalletHero extras", () => {
  it("folds earned/spent into one neutral caption", () => {
    render(<WalletHero coins={5} money={null} currency="USD" earned={2100} spent={860} />);
    expect(screen.getByText("Earned 2100 · Spent 860")).toBeInTheDocument();
  });
  it("at 0 coins explains earning with live settings and no top-up copy", () => {
    render(<WalletHero coins={0} money={0} currency="USD" earnPct={2.5} coinWorth={0.25} />);
    expect(screen.getByText(/Earn 2\.5% back/)).toHaveTextContent("$0.25");
    expect(screen.getByRole("link", { name: "Refer a friend" })).toHaveAttribute("href", "/me/refer");
    expect(screen.queryByText(/top up/i)).toBeNull();
  });
});
