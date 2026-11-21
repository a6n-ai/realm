// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { AppClock } from "@/components/dashboard/app-clock";
import { RouteStatusLine } from "@/components/dashboard/route-status-line";

vi.mock("@/lib/hooks/use-now", () => ({ useNow: () => new Date("2026-11-20T12:20:00Z") }));
vi.mock("@/components/ds/hover-hint", () => ({ HoverHint: ({ children }: { children: React.ReactNode }) => children }));

afterEach(cleanup);

const card = (routeStatus?: React.ReactNode) =>
  render(
    <TimezoneProvider tz="America/Toronto">
      <AppClock cutoffHour={18} variant="card" routeStatus={routeStatus} />
    </TimezoneProvider>,
  );

describe("clock card route status", () => {
  it("shows the line as a link to Dispatch", () => {
    card(<RouteStatusLine line={{ label: "Sent 9:12 am", tone: "ok", href: "/dashboard/dispatch", hint: "h" }} />);
    const link = screen.getByRole("link", { name: /OptimoRoute · Sent 9:12 am/ });
    expect(link).toHaveAttribute("href", "/dashboard/dispatch");
  });

  it("shows nothing without a status", () => {
    card();
    expect(screen.queryByText(/OptimoRoute/)).toBeNull();
    expect(screen.getByText(/Cutoff/)).toBeInTheDocument();
  });
});
