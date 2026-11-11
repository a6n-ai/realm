import { beforeEach, describe, expect, it, vi } from "vitest";

const guard = { staff: true };
const clearFollowUp = vi.fn(async () => undefined);

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/guards", () => ({
  requireStaff: async () => {
    if (!guard.staff) throw new Error("forbidden");
  },
}));
vi.mock("@/lib/services/inquiries.service", () => ({ inquiriesService: { clearFollowUp } }));

const { clearFollowUp: clearFollowUpAction } = await import("./actions");

describe("clearFollowUp action", () => {
  beforeEach(() => {
    guard.staff = true;
    clearFollowUp.mockClear();
  });

  it("refuses non-staff before touching the service", async () => {
    guard.staff = false;
    const res = await clearFollowUpAction("INQ-1");
    expect(res).toHaveProperty("error");
    expect(clearFollowUp).not.toHaveBeenCalled();
  });

  it("rejects an empty id without calling the service", async () => {
    const res = await clearFollowUpAction("   ");
    expect(res).toHaveProperty("error");
    expect(clearFollowUp).not.toHaveBeenCalled();
  });

  it("clears the follow-up for a valid staff call", async () => {
    const res = await clearFollowUpAction("INQ-1");
    expect(res).toMatchObject({ ok: true });
    expect(clearFollowUp).toHaveBeenCalledWith("INQ-1");
  });
});
