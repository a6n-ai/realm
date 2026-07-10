// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimezoneProvider, useTimezone } from "../timezone-provider";

function Show() {
  return <span>{useTimezone()}</span>;
}

describe("useTimezone", () => {
  it("returns the timezone supplied by the provider", () => {
    render(<TimezoneProvider tz="Asia/Kolkata"><Show /></TimezoneProvider>);
    expect(screen.getByText("Asia/Kolkata")).toBeTruthy();
  });

  it("throws outside a provider — a silent fallback would render in the browser zone", () => {
    // React logs the thrown error; assert on the throw, not the console.
    expect(() => render(<Show />)).toThrow(/TimezoneProvider/);
  });
});
