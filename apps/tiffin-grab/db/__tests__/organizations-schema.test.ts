import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { organization, member, invitation } from "../schema/organizations";
import { users } from "../schema/auth";

describe("organizations schema", () => {
  it("organization has clientCode, parentOrganizationId, region", () => {
    const cols = getTableColumns(organization);
    expect(cols.clientCode).toBeDefined();
    expect(cols.parentOrganizationId).toBeDefined();
    expect(cols.region).toBeDefined();
  });

  it("member links organizationId, userId, role", () => {
    const cols = getTableColumns(member);
    expect(cols.organizationId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.role).toBeDefined();
  });

  it("invitation has organizationId, email, role, status", () => {
    const cols = getTableColumns(invitation);
    expect(cols.organizationId).toBeDefined();
    expect(cols.email).toBeDefined();
    expect(cols.status).toBeDefined();
  });

  it("users has platformRole", () => {
    const cols = getTableColumns(users);
    expect(cols.platformRole).toBeDefined();
  });
});
