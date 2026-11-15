import { describe, expect, it } from "vitest";
import { clientStats, inviteStats, memberStats, overviewStats } from "../org-stats";
import type { MemberRow } from "../members/members-query";
import type { InviteRow } from "../invites/invite-status";

const values = (items: { label: string; value: string | number }[]) =>
  Object.fromEntries(items.map((i) => [i.label, i.value]));

const hrefs = (items: { label: string; href?: string }[]) =>
  Object.fromEntries(items.map((i) => [i.label, i.href]));

const builtIn = (role: string) => ["owner", "admin", "member"].includes(role);

const member = (id: string, over: Partial<MemberRow> = {}): MemberRow => ({
  id,
  joinedAt: new Date(0),
  name: null,
  email: `${id}@x.test`,
  phone: null,
  role: "member",
  memberId: `mem-${id}`,
  orgRole: "member",
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
    const access = [
      { id: "mem-a", roles: ["admin"] },
      { id: "mem-b", roles: ["member"] },
    ];
    expect(values(memberStats(rows, access, builtIn))).toEqual({
      Total: 2,
      Owners: 0,
      Admins: 1,
      "Custom roles": 0,
      Active: 1,
      "No password yet": 1,
    });
    expect(hrefs(memberStats(rows, access, builtIn))).toEqual({
      Total: "/dashboard/organization/people",
      Owners: "/dashboard/organization/people?role=owner",
      Admins: "/dashboard/organization/people?role=admin",
      "Custom roles": undefined,
      Active: "/dashboard/organization/people?status=active",
      "No password yet": "/dashboard/organization/people?password=unset",
    });
  });

  it("counts a comma-list member in each built-in it holds and flags custom roles", () => {
    const rows = [member("a"), member("b"), member("c", { status: "suspended" })];
    const access = [
      { id: "mem-a", roles: ["owner", "admin"] },
      { id: "mem-b", roles: ["admin", "Field lead"] },
      { id: "mem-c", roles: [] },
    ];
    expect(values(memberStats(rows, access, builtIn))).toMatchObject({
      Total: 3,
      Owners: 1,
      Admins: 2,
      "Custom roles": 1,
      Active: 2,
    });
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
    expect(hrefs(inviteStats(rows, now)).Expired).toBe("/dashboard/organization/people?invite=expired");
    expect(hrefs(inviteStats(rows, now)).Canceled).toBe("/dashboard/organization/people?invite=canceled");
  });

  it("counts clients by type and staffing", () => {
    const clients = [
      { isBrand: true, memberCount: 3 },
      { isBrand: false, memberCount: 2 },
      { isBrand: false, memberCount: 0 },
    ];
    expect(values(clientStats(clients))).toEqual({ Clients: 3, Brands: 1, Franchises: 2, "Staff seats": 5, "No staff": 1 });
    expect(hrefs(clientStats(clients))["Staff seats"]).toBeUndefined();
    expect(hrefs(clientStats(clients))["No staff"]).toBe("/dashboard/organization/settings?staff=none");
    expect(hrefs(clientStats(clients)).Franchises).toBe("/dashboard/organization/settings?type=franchise");
    expect(values(overviewStats(clients, [member("a", { role: "admin" })], 4))).toMatchObject({
      Franchises: 2,
      Staff: 1,
      Admins: 1,
      "Pending invites": 4,
    });
  });
});
