// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CoinsControl } from "@/components/order/coins-control";

afterEach(cleanup);

describe("CoinsControl", () => {
  it("prompts a guest to sign in instead of showing a disabled control", () => {
    render(<CoinsControl canRedeem={false} balance={0} value={null} onChange={vi.fn()} quote={null} />);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login?callbackUrl=/checkout",
    );
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("tells a zero-balance customer plainly, not with a silent no-op", () => {
    render(<CoinsControl canRedeem={true} balance={0} value={null} onChange={vi.fn()} quote={null} />);
    expect(screen.getByText(/0 coins to spend/i)).toBeInTheDocument();
  });

  it("caps the applied count to the balance and reports it via onChange", () => {
    const onChange = vi.fn();
    render(<CoinsControl canRedeem={true} balance={50} value={null} onChange={onChange} quote={null} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it("surfaces the server's zero-discount message instead of staying silent", () => {
    render(
      <CoinsControl
        canRedeem={true}
        balance={50}
        value={10}
        onChange={vi.fn()}
        quote={{
          requested: 10,
          coinsSpent: 0,
          applied: 0,
          message: "Not enough coins to shave anything off at the current rate.",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/not enough coins/i);
  });

  it("shows what was actually applied when the quote lands", () => {
    render(
      <CoinsControl
        canRedeem={true}
        balance={50}
        value={10}
        onChange={vi.fn()}
        quote={{ requested: 10, coinsSpent: 10, applied: 1.5, message: null }}
      />,
    );
    expect(screen.getByText(/spending 10 coins/i)).toBeInTheDocument();
  });

  it("disables editing once the order is locked (already priced by Clover)", () => {
    render(
      <CoinsControl
        canRedeem={true}
        balance={50}
        value={10}
        onChange={vi.fn()}
        quote={{ requested: 10, coinsSpent: 10, applied: 1.5, message: null }}
        locked
      />,
    );
    expect(screen.getByRole("spinbutton")).toBeDisabled();
    expect(screen.getByRole("button", { name: /remove/i })).toBeDisabled();
  });
});
