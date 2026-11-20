// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EatingDaysControl } from "./eating-days-control";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("./actions", () => ({ changeEatingDaysAction: async () => ({ ok: true }) }));

beforeAll(() => {
  Element.prototype.getAnimations = () => [];
  Element.prototype.checkVisibility = () => true;
});

afterEach(cleanup);

describe("EatingDaysControl day hints", () => {
  it("puts a disabled day's hint on a focusable wrapper, since disabled buttons get no pointer events", async () => {
    render(
      <EatingDaysControl
        orderId="order-1"
        eatingDays={["mon"]}
        deliveryDays={["mon", "tue", "wed", "thu", "fri"]}
        servesWeekends={false}
        bounds={{ min: 1, max: 7 }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const saturday = await screen.findByRole("button", { name: "Sat" });
    expect((saturday as HTMLButtonElement).disabled).toBe(true);
    const trigger = saturday.parentElement;
    expect(trigger?.getAttribute("data-slot")).toBe("tooltip-trigger");
    expect(trigger?.tabIndex).toBe(0);
  });
});
