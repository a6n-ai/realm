// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@/components/providers/timezone-provider", () => ({
  useTimezone: () => "America/Toronto",
}));

vi.mock("@/components/motion", () => {
  function Reveal({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={className}>{children}</div>;
  }
  Reveal.Group = function RevealGroup({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={className}>{children}</div>;
  };
  return {
    Reveal,
    Lottie: ({ label }: { label?: string }) => <div data-testid="lottie" aria-label={label} />,
  };
});

import { DeliveryHistory } from "../delivery-history";
import type { CustomerDelivery, CustomerActivity } from "@/lib/services/customer-deliveries.service";

afterEach(cleanup);

const scheduledPast: CustomerDelivery = {
  publicId: "del_1",
  orderPublicId: "ord_1",
  planName: "Weekly Veg",
  deliveryDate: "2026-07-01",
  status: "scheduled",
  isMakeup: false,
} as unknown as CustomerDelivery;

const skippedPast: CustomerDelivery = {
  publicId: "del_2",
  orderPublicId: "ord_1",
  planName: "Weekly Veg",
  deliveryDate: "2026-07-02",
  status: "skipped",
  isMakeup: false,
} as unknown as CustomerDelivery;

const skipActivity: CustomerActivity = {
  publicId: "act_1",
  type: "status_change",
  note: null,
  fromStatus: "scheduled",
  toStatus: "skipped",
  deliveryId: 2n,
  createdAt: Date.now(),
  orderPublicId: "ord_1",
};

describe("DeliveryHistory", () => {
  it("shows Delivered for a past scheduled delivery", () => {
    render(<DeliveryHistory history={[scheduledPast]} activity={[]} today="2026-07-13" />);
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });

  it("shows Skipped for a past skipped delivery", () => {
    render(<DeliveryHistory history={[skippedPast]} activity={[]} today="2026-07-13" />);
    expect(screen.getByText("Skipped")).toBeInTheDocument();
  });

  it("shows the describeActivity label for an activity row", () => {
    render(<DeliveryHistory history={[]} activity={[skipActivity]} today="2026-07-13" />);
    expect(screen.getByText("Status: scheduled → skipped")).toBeInTheDocument();
  });

  it("shows a muted empty-state message when there is no history and no activity", () => {
    render(<DeliveryHistory history={[]} activity={[]} today="2026-07-13" />);
    expect(screen.getByText("No past deliveries yet.")).toBeInTheDocument();
  });
});
