import { beforeEach, describe, expect, it, vi } from "vitest";

const { evictPublicPages, updateOrganization } = vi.hoisted(() => ({
  evictPublicPages: vi.fn(),
  updateOrganization: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/landing/public-cache", () => ({ evictPublicPages }));
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn() }));
vi.mock("../organizations.service", () => ({ updateOrganization }));

import { updateOrganizationAction } from "../organizations-actions";

beforeEach(() => {
  evictPublicPages.mockReset();
  updateOrganization.mockReset();
});

describe("organization actions", () => {
  it("evicts the public data caches (not just revalidates) after an update", async () => {
    updateOrganization.mockResolvedValue({ ok: true });
    await updateOrganizationAction("org", {} as never);
    expect(evictPublicPages).toHaveBeenCalledTimes(1);
  });

  it("does not evict when the update fails", async () => {
    updateOrganization.mockResolvedValue({ ok: false, error: "x" });
    await updateOrganizationAction("org", {} as never);
    expect(evictPublicPages).not.toHaveBeenCalled();
  });
});
