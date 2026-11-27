import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { inArray } from "drizzle-orm";
import { ForbiddenError } from "@foundry/commons";
import { db } from "@/db/client";
import { organization } from "@/db/schema";
import { insertTestInquiry, resetInquiryData } from "@/lib/inquiries/__tests__/helpers/inquiry-fixtures";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const requirePermission = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/auth/guards", () => ({ requirePermission }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
const visibleOrgs = vi.hoisted(() => vi.fn(async (): Promise<"all" | string[]> => "all"));
vi.mock("@/lib/auth/visible-orgs", () => ({ resolveSessionVisibleOrgIds: visibleOrgs }));

const { GET } = await import("../route");
const call = () => GET();

describe("GET /api/inquiries/export", () => {
  beforeEach(resetInquiryData);
  afterAll(resetInquiryData);

  it("exports name, email and phone as text", async () => {
    await insertTestInquiry({ fullName: "=1+1", phone: "+16475551700", email: "a@example.com" });
    const res = await call();
    expect(requirePermission).toHaveBeenCalledWith({ inquiry: ["export"] });
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Inquiries)).toEqual([{ Name: "=1+1", Email: "a@example.com", Phone: "+16475551700" }]);
    expect(wb.Sheets.Inquiries.A2.f).toBeUndefined();
  });

  it("leaves out other organizations and unassigned inquiries", async () => {
    const orgs = await db
      .insert(organization)
      .values(["Mine", "Theirs"].map((name) => ({ name: `${name} Org`, clientCode: `IX-${name}-${Date.now()}` })))
      .returning({ id: organization.id });
    const ids = orgs.map((o) => o.id);
    try {
      await insertTestInquiry({ fullName: "Mine", phone: "+16475551701", organizationId: ids[0] });
      await insertTestInquiry({ fullName: "Theirs", phone: "+16475551702", organizationId: ids[1] });
      await insertTestInquiry({ fullName: "Orphan", phone: "+16475551703" });
      visibleOrgs.mockResolvedValueOnce([ids[0]]);
      const wb = XLSX.read(new Uint8Array(await (await call()).arrayBuffer()), { type: "array" });
      expect(XLSX.utils.sheet_to_json<{ Name: string }>(wb.Sheets.Inquiries).map((r) => r.Name)).toEqual(["Mine"]);
    } finally {
      await resetInquiryData();
      await db.delete(organization).where(inArray(organization.id, ids));
    }
  });

  it("denies a caller without the export permission", async () => {
    requirePermission.mockRejectedValueOnce(new ForbiddenError("Forbidden"));
    expect((await call()).status).toBe(403);
  });
});
