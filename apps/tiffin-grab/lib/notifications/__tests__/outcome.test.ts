import { describe, expect, it } from "vitest";
import { notificationLogsHref, parseNotificationOutcome } from "../outcome";

describe("notification log drill", () => {
  it("keeps the queued-date range and the card outcome", () => {
    expect(notificationLogsHref({ from: "10", to: "20" })).toBe("/dashboard/notifications/logs?from=10&to=20");
    expect(notificationLogsHref({ from: "10", to: "20" }, "skipped")).toBe(
      "/dashboard/notifications/logs?from=10&to=20&outcome=skipped",
    );
    expect(notificationLogsHref({})).toBe("/dashboard/notifications/logs");
  });

  it("accepts only the four card outcomes", () => {
    expect(parseNotificationOutcome("delivered")).toBe("delivered");
    expect(parseNotificationOutcome("sent")).toBeNull();
  });
});
