import { beforeEach, describe, expect, it, vi } from "vitest";

const manageable = new Set(["org_1", "org_3", "org_4"]);

vi.mock("@/lib/auth/guards", () => ({
  can: vi.fn(async () => true),
  canIn: vi.fn(async (org: string) => manageable.has(org)),
}));
vi.mock("@/lib/auth/org-access", () => ({
  getOrgAccess: vi.fn(async () => ({ kind: "member", roles: ["admin"] })),
  effectivePermissions: vi.fn(() => ({})),
}));
vi.mock("@/lib/auth/role-options", () => ({
  getRoleChoices: vi.fn(async () => ({ organizationId: "org_1", options: [], canInvite: true })),
  getRoleChoicesFor: vi.fn(async () => [{ value: "kitchen", label: "kitchen" }]),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: "usr_me" }, session: { activeOrganizationId: "org_1" } })),
}));
vi.mock("@/lib/services/org-access-matrix", () => ({
  getOrgAccessMatrix: vi.fn(async () => ({
    rows: [{ id: "mem_2", roles: ["admin"], permissions: {}, email: "a@x.test", name: "A", roleCount: 1 }],
  })),
}));
vi.mock("@/lib/services/organizations.service", () => ({
  listMembershipsForUser: vi.fn(async () => [
    { memberId: "m1", organizationId: "org_1", organizationName: "Brand", role: "admin" },
    { memberId: "m2", organizationId: "org_2", organizationName: "Hidden franchise", role: "owner" },
    { memberId: "m3", organizationId: "org_3", organizationName: "Franchise C", role: "kitchen" },
  ]),
  listOrganizations: vi.fn(async () => [
    { id: "org_1", name: "Brand" },
    { id: "org_2", name: "Hidden franchise" },
    { id: "org_3", name: "Franchise C" },
    { id: "org_4", name: "Franchise D" },
    { id: "org_5", name: "Hidden franchise E" },
  ]),
}));
vi.mock("../members-query", () => ({
  getMembersForOrgs: vi.fn(async () => [{ id: "usr_2", memberId: "mem_2", name: "A", email: "a@x.test", status: "active" }]),
}));

const { loadMemberPanel } = await import("../member-panel-data");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadMemberPanel", () => {
  it("hides other orgs the viewer cannot manage and shows their names only", async () => {
    const data = await loadMemberPanel("mem_2");
    expect(data?.memberships).toEqual([
      { organizationId: "org_1", name: "Brand", role: "admin" },
      { organizationId: "org_3", name: "Franchise C", role: null },
    ]);
  });

  it("lists add-to-org only for manageable orgs the person is not in, with assignable roles", async () => {
    const data = await loadMemberPanel("mem_2");
    expect(data?.addableOrgs).toEqual([{ id: "org_4", name: "Franchise D", roles: [{ value: "kitchen", label: "kitchen" }] }]);
  });
});
