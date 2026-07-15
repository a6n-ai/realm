// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/motion", () => ({
  AnimatedNumber: ({ value, format }: { value: number; format?: (n: number) => string }) => <span>{format ? format(value) : String(value)}</span>,
  Lottie: () => <div data-testid="lottie" />,
}));
import { WalletHero } from "../wallet-hero";
import { EarnSpendTiles } from "../earn-spend-tiles";
afterEach(cleanup);
describe("WalletHero", () => {
  it("shows coins and money value", () => {
    render(<WalletHero coins={1240} money={12.4} />);
    expect(screen.getByText("1240")).toBeInTheDocument();
    expect(screen.getByText(/\$12\.40/)).toBeInTheDocument();
  });
  it("hides money when null", () => {
    render(<WalletHero coins={1240} money={null} />);
    expect(screen.queryByText(/\$/)).toBeNull();
  });
});
describe("EarnSpendTiles", () => {
  it("shows earned and spent", () => {
    render(<EarnSpendTiles earned={2100} spent={860} />);
    expect(screen.getByText("2100")).toBeInTheDocument();
    expect(screen.getByText("860")).toBeInTheDocument();
  });
});
