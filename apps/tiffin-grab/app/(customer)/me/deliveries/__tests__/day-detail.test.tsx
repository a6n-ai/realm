// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  skipMyDelivery: vi.fn(),
  unskipMyDelivery: vi.fn(),
  setMyDeliveryAddress: vi.fn(),
  clearMyDeliveryAddress: vi.fn(),
}));

vi.mock("../meals/actions", () => ({
  pickMyDish: vi.fn(),
  applyMyDishToWeek: vi.fn(),
}));

import { DayDetail } from "../day-detail";
import type { CalendarCell } from "../calendar-constants";
import type { CustomerDelivery } from "@/lib/services/customer-deliveries.service";
import type { DeliveryCardMeal } from "../meal-chips";

afterEach(cleanup);

type Address = { fullName: string; addressLine: string; city: string; postalCode: string };
type DeliveryCardData = CustomerDelivery & { meal: DeliveryCardMeal; address: Address; hasAddressOverride: boolean };

const address: Address = { fullName: "A", addressLine: "1 St", city: "City", postalCode: "00000" };

function makeDelivery(overrides: Partial<DeliveryCardData> = {}): DeliveryCardData {
  return {
    publicId: "del_1",
    orderPublicId: "ord_1",
    planName: "Weekly Veg",
    deliveryDate: "2026-07-20",
    status: "scheduled",
    isMakeup: false,
    cutoffAt: Date.now() + 1000 * 60 * 60 * 24,
    makeupForDeliveryId: null,
    meal: [],
    address,
    hasAddressOverride: false,
    ...overrides,
  } as unknown as DeliveryCardData;
}

function makeCell(overrides: Partial<CalendarCell> = {}): CalendarCell {
  return {
    date: "2026-07-20",
    status: "scheduled",
    locked: false,
    isMakeup: false,
    meal: null,
    options: [],
    menuWeekId: "week_1",
    ...overrides,
  } as CalendarCell;
}

const noop = () => undefined;

describe("DayDetail — off-day (no cell, no delivery)", () => {
  it("shows the inert 'Not scheduled' state, never Locked/Sealed", () => {
    render(
      <DayDetail dateIso="2026-07-25" cell={undefined} delivery={undefined} orderPublicId="ord_1" categoryLabels={{}} tz="UTC" onChanged={noop} />,
    );
    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
    expect(screen.getByText("Not scheduled this day.")).toBeInTheDocument();
    expect(screen.queryByText("Locked")).not.toBeInTheDocument();
    expect(screen.queryByText(/Skip this day/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Change address/i)).not.toBeInTheDocument();
  });
});

describe("DayDetail — unreleased week (delivery, no cell)", () => {
  it("shows only 'Menu not published yet', no Locked pill", () => {
    render(
      <DayDetail
        dateIso="2026-07-20"
        cell={undefined}
        delivery={makeDelivery({ meal: { pending: true } })}
        orderPublicId="ord_1"
        categoryLabels={{}}
        tz="UTC"
        onChanged={noop}
      />,
    );
    expect(screen.getByText("Menu not published yet")).toBeInTheDocument();
    expect(screen.queryByText("Locked")).not.toBeInTheDocument();
    expect(screen.queryByText("Not scheduled")).not.toBeInTheDocument();
    expect(screen.queryByText(/Skip this day/i)).not.toBeInTheDocument();
  });
});

describe("DayDetail — scheduled, pre-cutoff cell", () => {
  it("shows Skip this day and Change address", () => {
    render(
      <DayDetail
        dateIso="2026-07-20"
        cell={makeCell()}
        delivery={makeDelivery({ status: "scheduled" })}
        orderPublicId="ord_1"
        categoryLabels={{}}
        tz="UTC"
        onChanged={noop}
      />,
    );
    expect(screen.getByRole("button", { name: /Skip this day/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change address/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Un-skip/i })).not.toBeInTheDocument();
  });

  it("shows Un-skip, not Skip or Change address, for a skipped day", () => {
    render(
      <DayDetail
        dateIso="2026-07-20"
        cell={makeCell({ status: "skipped" })}
        delivery={makeDelivery({ status: "skipped" })}
        orderPublicId="ord_1"
        categoryLabels={{}}
        tz="UTC"
        onChanged={noop}
      />,
    );
    expect(screen.getByRole("button", { name: /Un-skip/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Skip this day/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change address/i })).not.toBeInTheDocument();
  });

  it("does not offer Skip for a make-up delivery", () => {
    render(
      <DayDetail
        dateIso="2026-07-20"
        cell={makeCell({ isMakeup: true, status: "scheduled" })}
        delivery={makeDelivery({ isMakeup: true, status: "scheduled" })}
        orderPublicId="ord_1"
        categoryLabels={{}}
        tz="UTC"
        onChanged={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: /Skip this day/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change address/i })).toBeInTheDocument();
  });
});

describe("DayDetail — locked (past cutoff) cell", () => {
  it("shows neither Skip nor Change address", () => {
    render(
      <DayDetail
        dateIso="2026-07-20"
        cell={makeCell({ locked: true })}
        delivery={makeDelivery({ cutoffAt: Date.now() - 1000 })}
        orderPublicId="ord_1"
        categoryLabels={{}}
        tz="UTC"
        onChanged={noop}
      />,
    );
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Skip this day/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change address/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Un-skip/i })).not.toBeInTheDocument();
  });
});
