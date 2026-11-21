// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries/view";
import { actionModel } from "../action-model";
import { TripActions } from "../action-panel";
import { Legend } from "../week-timeline";

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
  Element.prototype.getAnimations = () => [];
  Element.prototype.scrollIntoView = function () {};
  Element.prototype.checkVisibility = () => true;
  Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
  document.elementFromPoint = () => null;
  document.elementsFromPoint = () => [];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  document.head.append(Object.assign(document.createElement("style"), { textContent: "[popover][data-open] { display: block !important }" }));
});

afterEach(cleanup);

const ctx = { cutoffHour: 18, timezone: "UTC", lastDeliveryDate: null, deliveryWeekdays: ["mon"], active: true };
const trip: Trip = { orderId: "o", date: "2026-09-23", deliveryId: "a", units: 1, coversDates: ["2026-09-23"], coversLabel: null, eatingDays: [], status: "upcoming", cutoffAt: Date.now() + 9e9, mergedInto: null, isMakeup: false, rescheduled: false };

describe("customer popovers", () => {
  it("Legend opens on tap and closes on Escape", () => {
    render(<Legend />);
    const trigger = screen.getByRole("button", { name: "What the colours mean" });
    expect(trigger).toHaveAttribute("data-slot", "popover-trigger");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toHaveTextContent("Delivery day");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the more-actions menu opens on tap, fires its action and closes", () => {
    const onAction = vi.fn();
    render(<TripActions model={actionModel(trip, Date.now(), ctx)} layout="card" onAction={onAction} onGoTo={() => {}} />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(trigger).toHaveAttribute("data-slot", "popover-trigger");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Change address" }));
    expect(onAction).toHaveBeenCalledWith("address");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
