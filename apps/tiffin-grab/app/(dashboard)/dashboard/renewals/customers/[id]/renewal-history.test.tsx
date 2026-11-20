// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { RenewalReminders } from "./renewal-history";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/renewals",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./renewal-actions", () => ({ UnpaidPlanActions: () => null }));
vi.mock("./plan-track", () => ({ PlanTrack: () => null }));
vi.mock("../../_track/track-status", () => ({ TrackStatusPill: () => null }));

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
  Element.prototype.getAnimations = () => [];
  Element.prototype.checkVisibility = () => true;
  document.head.append(
    Object.assign(document.createElement("style"), {
      textContent: "[popover] { display: block !important }",
    })
  );
});

afterEach(cleanup);

describe("RenewalReminders", () => {
  it("keeps every cell a direct child of its row, with the delivery hint inside its cell", () => {
    const { container } = render(
      <TimezoneProvider tz="America/Toronto">
        <RenewalReminders
          plans={[]}
          reminders={[
            { sentAt: 1763596800000, daysLeft: 5, byStaff: false, orderPublicId: null, delivery: "delivered", deliveredAt: 1763600400000, error: null },
          ]}
        />
      </TimezoneProvider>,
    );
    const tooltip = container.querySelector('[data-slot="tooltip-content"]');
    expect(tooltip).toHaveTextContent("Reached the customer's mail server");
    expect(tooltip!.parentElement!.tagName).not.toBe("TR");
    expect(tooltip!.closest("td")).not.toBeNull();
    for (const cell of container.querySelectorAll("td")) {
      expect(cell.parentElement!.tagName).toBe("TR");
    }
  });
});
