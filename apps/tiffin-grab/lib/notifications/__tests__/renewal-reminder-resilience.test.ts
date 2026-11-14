// @vitest-db
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/inquiries/inquiry-links.service", () => ({
  openRenewal: async () => { throw new Error("inquiry down"); },
  reconcileOrders: async () => { throw new Error("inquiry down"); },
  logReminderSent: async () => { throw new Error("inquiry down"); },
}));

const { sendRenewalReminders } = await import("../renewal-reminder");

describe("renewal reminders survive inquiry bookkeeping failures", () => {
  it("sendRenewalReminders still runs when the inquiry steps throw", async () => {
    const summary = await sendRenewalReminders();
    expect(summary).toHaveProperty("days5");
    expect(summary).toHaveProperty("days1");
  });
});
