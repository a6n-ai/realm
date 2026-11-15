import { describe, expect, it } from "vitest";
import { EXPIRING_WITHIN_MS, summarizeAttention, type AttentionInput } from "../org-health";

const NOW = Date.UTC(2026, 10, 15, 12);
const HOUR = 60 * 60 * 1000;

function input(over: Partial<AttentionInput> = {}): AttentionInput {
  return {
    now: NOW,
    invites: [],
    members: [],
    customRoles: [],
    builtIns: ["owner", "admin", "member"],
    franchises: [],
    manageable: new Set(),
    ...over,
  };
}

describe("summarizeAttention", () => {
  it("counts pending invites expiring within 48h and expired ones, not accepted or canceled", () => {
    const r = summarizeAttention(
      input({
        invites: [
          { status: "pending", expiresAt: new Date(NOW + 2 * HOUR) },
          { status: "pending", expiresAt: new Date(NOW + EXPIRING_WITHIN_MS + HOUR) },
          { status: "pending", expiresAt: new Date(NOW - HOUR) },
          { status: "accepted", expiresAt: new Date(NOW - HOUR) },
          { status: "canceled", expiresAt: new Date(NOW + HOUR) },
        ],
      }),
    );
    expect(r.expiringInvites).toBe(1);
    expect(r.expiredInvites).toBe(1);
  });

  it("treats an empty role list and a deleted custom role as no role", () => {
    const r = summarizeAttention(
      input({
        members: [
          { organizationId: "o1", role: "" },
          { organizationId: "o1", role: "gone_custom" },
          { organizationId: "o1", role: "admin,gone_custom" },
          { organizationId: "o1", role: "custom" },
        ],
        customRoles: [{ organizationId: "o1", role: "custom" }],
      }),
    );
    expect(r.noRoleMemberships).toBe(2);
  });

  it("a custom role only resolves in the org that owns it", () => {
    const r = summarizeAttention(
      input({
        members: [{ organizationId: "o2", role: "custom" }],
        customRoles: [{ organizationId: "o1", role: "custom" }],
      }),
    );
    expect(r.noRoleMemberships).toBe(1);
  });

  it("flags owner-less franchises only where the viewer can manage members", () => {
    const r = summarizeAttention(
      input({
        franchises: [
          { id: "f1", name: "Permitted" },
          { id: "f2", name: "Not permitted" },
          { id: "f3", name: "Has owner" },
        ],
        members: [
          { organizationId: "f1", role: "admin" },
          { organizationId: "f2", role: "admin" },
          { organizationId: "f3", role: "admin,owner" },
        ],
        manageable: new Set(["f1", "f3"]),
      }),
    );
    expect(r.ownerlessFranchises).toEqual([{ id: "f1", name: "Permitted" }]);
  });
});
