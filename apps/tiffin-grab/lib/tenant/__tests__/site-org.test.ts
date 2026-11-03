import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organization } from "@/db/schema";

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound }));

import { siteOrgId } from "../site-org";

let orgId: string;
beforeAll(async () => {
  [{ id: orgId }] = await db.insert(organization).values({ name: "Site Org", clientCode: `SO-${Date.now()}` }).returning({ id: organization.id });
});
afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, orgId));
});

describe("siteOrgId", () => {
  it("maps brand to null", async () => {
    expect(await siteOrgId("brand")).toBeNull();
  });
  it("returns a known organization id", async () => {
    expect(await siteOrgId(orgId)).toBe(orgId);
  });
  it("calls notFound for anything else", async () => {
    await expect(siteOrgId("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
  it("finds an org created after the snapshot was taken", async () => {
    const [{ id }] = await db.insert(organization).values({ name: "Late Org", clientCode: `LO-${Date.now()}` }).returning({ id: organization.id });
    try {
      expect(await siteOrgId(id)).toBe(id);
    } finally {
      await db.delete(organization).where(eq(organization.id, id));
    }
  });
});
