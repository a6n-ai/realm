import { describe, expect, it } from "vitest";
import { clientStats, inviteStats, memberStats, overviewStats } from "../org-stats";
import type { MemberRow } from "../members/members-query";
import type { InviteRow } from "../invites/invites-list";

const values = (items: { label: string; value: string | number }[]) =>
  Object.fromEntries(items.map((i) => [i.label, i.value]));

const member = (id: string, over: Partial<MemberRow> = {}): MemberRow => ({
  id,
  name: null,
  email: `${id}@x.test`,
  phone: null,
  role: "member",
  status: "active",
  passwordSet: true,
  invitationStatus: "none",
  organizationId: "o1",
  ...over,
});

describe("org stats", () => {
  it("counts people once even when they belong to several orgs", () => {
    const rows = [
      member("a", { role: "admin" }),
      member("a", { role: "admin", organizationId: "o2" }),
      member("b", { status: "inactive", passwordSet: false }),
    ];
    expect(values(memberStats(rows))).toEqual({ Total: 2, Admins: 1, Members: 1, Active: 1, "No password yet": 1 });
  });

  it("splits expired out of pending using the given clock", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    const invite = (status: InviteRow["status"], expiresAt: string): InviteRow => ({
      id: expiresAt + status,
      userId: "u",
      email: "e@x.test",
      role: "member",
      status,
      expiresAt,
      organizationId: "o1",
    });
    const rows = [
      invite("pending", "2026-10-21T00:00:00Z"),
      invite("pending", "2026-10-19T00:00:00Z"),
      invite("accepted", "2026-10-19T00:00:00Z"),
      invite("canceled", "2026-10-21T00:00:00Z"),
      invite("rejected", "2026-10-21T00:00:00Z"),
    ];
    expect(values(inviteStats(rows, now))).toEqual({ Total: 5, Pending: 1, Accepted: 1, Expired: 1, Canceled: 2 });
  });

  it("counts clients by type and staffing", () => {
    const clients = [
      { isBrand: true, memberCount: 3 },
      { isBrand: false, memberCount: 2 },
      { isBrand: false, memberCount: 0 },
    ];
    expect(values(clientStats(clients))).toEqual({ Clients: 3, Brands: 1, Franchises: 2, "Staff seats": 5, "No staff": 1 });
    expect(values(overviewStats(clients, [member("a", { role: "admin" })], 4))).toMatchObject({
      Franchises: 2,
      Staff: 1,
      Admins: 1,
      "Pending invites": 4,
    });
  });
});
