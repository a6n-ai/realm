import { describe, expect, it } from "vitest";
import { deliveryDisplayStatus } from "../display-status";

describe("deliveryDisplayStatus", () => {
  const today = "2026-07-13";
  it("future scheduled → Scheduled", () => { expect(deliveryDisplayStatus("scheduled", "2026-07-20", today)).toBe("Scheduled"); });
  it("past scheduled → Delivered (derived)", () => { expect(deliveryDisplayStatus("scheduled", "2026-07-05", today)).toBe("Delivered"); });
  it("today scheduled → Scheduled (not yet delivered)", () => { expect(deliveryDisplayStatus("scheduled", today, today)).toBe("Scheduled"); });
  it("skipped → Skipped regardless of date", () => { expect(deliveryDisplayStatus("skipped", "2026-07-05", today)).toBe("Skipped"); });
  it("paused → Paused", () => { expect(deliveryDisplayStatus("paused", "2026-07-05", today)).toBe("Paused"); });
  it("cancelled → Cancelled", () => { expect(deliveryDisplayStatus("cancelled", "2026-07-05", today)).toBe("Cancelled"); });
});
