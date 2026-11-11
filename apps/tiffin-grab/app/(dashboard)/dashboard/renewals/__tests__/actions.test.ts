import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@foundry/commons";

const m = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  assertOrderVisible: vi.fn(),
  sendRenewalReminderNow: vi.fn(),
  setTrackStatus: vi.fn(),
  addTrackNote: vi.fn(),
  logTrackActivity: vi.fn(),
  revalidatePath: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePermission: m.requirePermission }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({}) }));
vi.mock("@/lib/auth/visible-orgs", () => ({ resolveSessionVisibleOrgIds: async () => "all" }));
vi.mock("@/lib/services/orders.service", () => ({ assertOrderVisible: m.assertOrderVisible }));
vi.mock("@/lib/notifications/renewal-reminder", () => ({ sendRenewalReminderNow: m.sendRenewalReminderNow }));
vi.mock("@/lib/services/renewal-tracking.service", () => ({
  setTrackStatus: m.setTrackStatus,
  addTrackNote: m.addTrackNote,
  logTrackActivity: m.logTrackActivity,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@foundry/commons/logger", () => ({ createLogger: () => ({ warn: m.warn }) }));

const actions = await import("../actions");

beforeEach(() => {
  vi.clearAllMocks();
  m.setTrackStatus.mockResolvedValue({ previous: null });
});

describe("renewal tracking actions", () => {
  it("guard order write and visibility before the service", async () => {
    await actions.setTrackStatusAction("ord_1", "cus_1", { status: "expected" });
    expect(m.requirePermission).toHaveBeenCalledWith({ order: ["write"] });
    expect(m.assertOrderVisible).toHaveBeenCalledWith("ord_1", "all");
    expect(m.assertOrderVisible.mock.invocationCallOrder[0]).toBeLessThan(m.setTrackStatus.mock.invocationCallOrder[0]);
    expect(m.setTrackStatus).toHaveBeenCalledWith("ord_1", { status: "expected" });
  });

  it("returns an error and skips the service when the order guard denies access", async () => {
    m.assertOrderVisible.mockRejectedValueOnce(new ValidationError("Order not found"));
    expect(await actions.setTrackStatusAction("ord_1", "cus_1", { status: "expected" })).toEqual({
      error: "Order not found",
    });
    expect(m.setTrackStatus).not.toHaveBeenCalled();
  });

  it("returns a service ValidationError as a failed result", async () => {
    m.setTrackStatus.mockRejectedValue(new ValidationError("A reason is required to mark a plan not renewed"));
    expect(await actions.setTrackStatusAction("ord_1", null, { status: "not_renewed" })).toEqual({
      error: "A reason is required to mark a plan not renewed",
    });
  });

  it("adds a note and logs a call", async () => {
    expect(await actions.addTrackNoteAction("ord_1", "cus_1", "Hi", 123)).toEqual({ ok: true });
    expect(m.addTrackNote).toHaveBeenCalledWith("ord_1", "Hi", 123);
    expect(await actions.logTrackActivityAction("ord_1", "cus_1", { type: "call", note: "Left VM" })).toEqual({ ok: true });
    expect(m.logTrackActivity).toHaveBeenCalledWith("ord_1", { type: "call", note: "Left VM" });
  });

  it("revalidates the renewals list and the customer pages", async () => {
    await actions.addTrackNoteAction("ord_1", "cus_1", "Hi");
    expect(m.revalidatePath).toHaveBeenCalledWith("/dashboard/renewals");
    expect(m.revalidatePath).toHaveBeenCalledWith("/dashboard/renewals/customers/cus_1");
    expect(m.revalidatePath).toHaveBeenCalledWith("/dashboard/customers/cus_1/renewals");
  });
});

describe("sendRenewalReminderAction", () => {
  it("logs reminder_sent when the email is sent", async () => {
    m.sendRenewalReminderNow.mockResolvedValue("sent");
    expect(await actions.sendRenewalReminderAction("ord_1", "cus_1")).toEqual({ ok: true, message: "Reminder sent" });
    expect(m.logTrackActivity).toHaveBeenCalledWith("ord_1", { type: "reminder_sent" });
  });

  it("does not log when already sent today", async () => {
    m.sendRenewalReminderNow.mockResolvedValue("already-sent");
    expect(await actions.sendRenewalReminderAction("ord_1", "cus_1")).toEqual({ ok: true, message: "Already sent today" });
    expect(m.logTrackActivity).not.toHaveBeenCalled();
  });

  it("still reports the reminder sent when the activity log write fails", async () => {
    m.sendRenewalReminderNow.mockResolvedValue("sent");
    m.logTrackActivity.mockRejectedValueOnce(new Error("db down"));
    expect(await actions.sendRenewalReminderAction("ord_1", "cus_1")).toEqual({ ok: true, message: "Reminder sent" });
    expect(m.warn).toHaveBeenCalledWith(expect.objectContaining({ orderPublicId: "ord_1" }), expect.any(String));
  });

  it("does not send when the order guard denies access", async () => {
    m.assertOrderVisible.mockRejectedValueOnce(new ValidationError("Order not found"));
    const res = await actions.sendRenewalReminderAction("ord_1", "cus_1");
    expect(res).toEqual({ error: "Order not found" });
    expect(m.sendRenewalReminderNow).not.toHaveBeenCalled();
    expect(m.logTrackActivity).not.toHaveBeenCalled();
  });
});
