import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

const run = { closed: 3, needsPlacing: 0, failed: [] as string[], removedFromRoute: 0 };
const requirePermission = vi.fn(async (_: unknown) => undefined);
const createHoliday = vi.fn(async (..._: unknown[]) => ({ created: true as const, publicId: "hol_1", ...run }));
const reapplyHoliday = vi.fn(async (..._: unknown[]) => ({ ...run, closed: 1 }));
const renameHoliday = vi.fn(async (..._: unknown[]) => undefined);
const removeHoliday = vi.fn(async (..._: unknown[]) => ({ restored: 2, left: 0, failed: [] as string[], removed: true }));
const placeHolidayDay = vi.fn(async (..._: unknown[]) => ["2030-01-21", "2030-01-23"]);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/services/session-service", () => ({ currentUserId: async () => 7n }));
vi.mock("@/lib/services/orders.service", () => ({ resolveSessionVisibleOrgIds: async () => ["org_a"] }));
vi.mock("@/lib/services/holidays.service", () => ({ createHoliday, reapplyHoliday, renameHoliday, removeHoliday, placeHolidayDay }));

const { createHolidayAction, placeHolidayDayAction, reapplyHolidayAction, removeHolidayAction, renameHolidayAction } = await import("../actions");
const input = { organizationId: "org_a", date: "2030-01-09", name: "Diwali", notify: true };

describe("holiday actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("declare needs holiday:write and stamps the actor and visibility from the session", async () => {
    const res = await createHolidayAction(input);
    expect(requirePermission).toHaveBeenCalledWith({ holiday: ["write"] });
    expect(createHoliday).toHaveBeenCalledWith({ ...input, confirmToday: false }, 7n, ["org_a"]);
    expect(res).toMatchObject({ ok: true, message: "Holiday saved. 3 deliveries closed, 3 added back at the end of the plan." });
  });

  it("hands back the preview for today instead of a message", async () => {
    createHoliday.mockResolvedValueOnce({ created: false, preview: { affected: 4, onRoute: 1, delivered: 2 } } as never);
    const res = await createHolidayAction(input);
    expect(res).toMatchObject({ ok: true, preview: { affected: 4, onRoute: 1, delivered: 2 } });
  });

  it("returns the service's refusal for an organization the caller cannot see", async () => {
    createHoliday.mockRejectedValueOnce(new NotFoundError("Organization not found"));
    expect(await createHolidayAction({ ...input, organizationId: "org_other" })).toEqual({ error: "Organization not found" });
  });

  it("says what needs placing, what left the route and what failed", async () => {
    createHoliday.mockResolvedValueOnce({ created: true, publicId: "hol_1", closed: 3, needsPlacing: 1, failed: ["SUB-AAA"], removedFromRoute: 2 });
    const res = await createHolidayAction(input);
    expect(res).toMatchObject({ ok: true, message: "Holiday saved. 3 deliveries closed, 2 added back at the end of the plan. 1 waiting under Needs placing. 2 removed from today's route. Could not close: SUB-AAA. Re-apply to retry." });
  });

  it("a staff member without the permission gets the guard's refusal and the service is never called", async () => {
    requirePermission.mockRejectedValueOnce(new Error("Forbidden"));
    const res = await createHolidayAction(input);
    expect("error" in res).toBe(true);
    expect(createHoliday).not.toHaveBeenCalled();
  });

  it("re-apply, rename, remove and place each need holiday:write and pass visibility to the service", async () => {
    expect(await reapplyHolidayAction("hol_1")).toMatchObject({ ok: true, message: "Re-applied. 1 delivery closed, 1 added back at the end of the plan." });
    expect(reapplyHoliday).toHaveBeenCalledWith("hol_1", 7n, ["org_a"]);

    await renameHolidayAction("hol_1", "Diwali");
    expect(renameHoliday).toHaveBeenCalledWith("hol_1", "Diwali", 7n, ["org_a"]);

    expect(await removeHolidayAction("hol_1")).toMatchObject({ ok: true, removed: true, message: "Holiday removed. Restored 2 deliveries." });
    expect(removeHoliday).toHaveBeenCalledWith("hol_1", 7n, ["org_a"]);

    expect(await placeHolidayDayAction("dlv_1", "2030-01-21")).toMatchObject({ ok: true, message: "Placed on Mon, Jan 21 and Wed, Jan 23." });
    expect(placeHolidayDay).toHaveBeenCalledWith("dlv_1", "2030-01-21", 7n, ["org_a"]);

    expect(requirePermission).toHaveBeenCalledTimes(4);
    expect(requirePermission).toHaveBeenLastCalledWith({ holiday: ["write"] });
  });

  it("each action returns the service's not-found instead of throwing", async () => {
    reapplyHoliday.mockRejectedValueOnce(new NotFoundError("Holiday not found"));
    renameHoliday.mockRejectedValueOnce(new NotFoundError("Holiday not found"));
    removeHoliday.mockRejectedValueOnce(new NotFoundError("Holiday not found"));
    placeHolidayDay.mockRejectedValueOnce(new NotFoundError("Delivery not found"));
    expect(await reapplyHolidayAction("x")).toEqual({ error: "Holiday not found" });
    expect(await renameHolidayAction("x", "n")).toEqual({ error: "Holiday not found" });
    expect(await removeHolidayAction("x")).toEqual({ error: "Holiday not found" });
    expect(await placeHolidayDayAction("x", "2030-01-21")).toEqual({ error: "Delivery not found" });
  });

  it("remove says so when an order could not be undone and the holiday was kept", async () => {
    removeHoliday.mockResolvedValueOnce({ restored: 1, left: 2, failed: ["SUB-BBB"], removed: false });
    expect(await removeHolidayAction("hol_1")).toMatchObject({
      ok: true,
      removed: false,
      message: "Holiday kept for now. Restored 1 delivery, left 2 with their extra day in place (already changed, or past cutoff). Could not undo: SUB-BBB. Remove again to finish.",
    });
  });

  it("remove says so when nothing failed but a delivery was closed during removal", async () => {
    removeHoliday.mockResolvedValueOnce({ restored: 2, left: 0, failed: [], removed: false });
    expect(await removeHolidayAction("hol_1")).toMatchObject({
      removed: false,
      message: "Holiday kept for now. Restored 2 deliveries. A delivery was closed for it while removing. Remove again to finish.",
    });
  });
});
