import { describe, expect, it } from "vitest";
import { describeCron } from "@/lib/cron/jobs";
import { renewalReminderMessage } from "../renewal-reminder";

const plan = { orderPublicId: "ord_1", code: "SUB-ABC123", userId: 1n, customerName: "Asha", mealSize: "Large", lastTiffin: "2026-10-30" };

describe("renewalReminderMessage", () => {
  it("5 days out names the date; 1 day out says tomorrow", () => {
    expect(renewalReminderMessage(plan, 5).order.lastTiffinWhen).toBe("on Friday, Oct 30");
    expect(renewalReminderMessage(plan, 1).order.lastTiffinWhen).toBe("tomorrow");
    expect(renewalReminderMessage(plan, 1).title).toBe("Your plan ends tomorrow");
    expect(renewalReminderMessage(plan, 5).order.lastTiffin).toBe("Fri, Oct 30, 2026");
  });

  it("dedupes per plan, per last-tiffin date, per offset", () => {
    expect(renewalReminderMessage(plan, 5).dedupeKey).toBe("renewal:ord_1:2026-10-30:5");
    expect(renewalReminderMessage({ ...plan, lastTiffin: "2026-11-02" }, 5).dedupeKey).toBe("renewal:ord_1:2026-11-02:5");
  });

  it("fills the template fields", () => {
    expect(renewalReminderMessage(plan, 5).order).toMatchObject({ code: "SUB-ABC123", customerName: "Asha", mealSize: "Large" });
    expect(renewalReminderMessage({ ...plan, customerName: null, mealSize: null }, 5).order).toMatchObject({ customerName: "", mealSize: "tiffin" });
  });

  it("runs at 9 AM Toronto", () => {
    expect(describeCron("0 13 * * *", "America/Toronto", Date.parse("2026-10-23T07:00:00Z"))).toBe("Daily 9:00 AM");
  });
});
