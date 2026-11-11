import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

const guard = { staff: true, visible: true };
const clearFollowUp = vi.fn(async () => undefined);
const assertInquiriesVisible = vi.fn(async () => {
  if (!guard.visible) throw new NotFoundError("Inquiry not found");
});

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/guards", () => ({
  requireStaff: async () => {
    if (!guard.staff) throw new Error("forbidden");
  },
}));
vi.mock("@/lib/services/inquiries.service", () => ({ inquiriesService: { clearFollowUp }, assertInquiriesVisible }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
vi.mock("@/lib/auth/visible-orgs", () => ({ resolveSessionVisibleOrgIds: async () => ["org_a"] }));

const { clearFollowUp: clearFollowUpAction } = await import("./actions");

describe("clearFollowUp action", () => {
  beforeEach(() => {
    guard.staff = true;
    guard.visible = true;
    clearFollowUp.mockClear();
    assertInquiriesVisible.mockClear();
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

  it("refuses a lead outside the viewer's organizations", async () => {
    guard.visible = false;
    const res = await clearFollowUpAction("INQ-1");
    expect(res).toMatchObject({ error: "Inquiry not found" });
    expect(assertInquiriesVisible).toHaveBeenCalledWith(["INQ-1"], ["org_a"]);
    expect(clearFollowUp).not.toHaveBeenCalled();
  });
});
