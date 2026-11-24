import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureSystemUser } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadSources, leadSubsources } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/services/meta-pixel/config", () => ({
  metaPixel: {
    leadgenConnection: async () => ({
      pageAccessToken: "page-token",
      appSecret: null,
      verifyToken: "verify",
    }),
    connection: async () => null,
  },
}));

const { ingestMetaLeadgenWebhook } = await import("../leadgen-ingest");

const createdLeadIds: string[] = [];

function leadId(): string {
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 16);
  createdLeadIds.push(id);
  return id;
}

function phone(): string {
  return `647${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

function webhook(id: string): string {
  return JSON.stringify({
    object: "page",
    entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: id, created_time: 1_700_000_000 } }] }],
  });
}

function stubLead(id: string, fieldData: { name: string; values: string[] }[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ id, created_time: "2026-01-01T00:00:00+0000", field_data: fieldData }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

async function saved(id: string) {
  const [row] = await db
    .select({
      stage: inquiries.stage,
      subStatus: inquiries.subStatus,
      source: leadSources.key,
      subSource: leadSubsources.key,
      subLabel: leadSubsources.label,
      notes: inquiries.notes,
      fullName: inquiries.fullName,
      phone: inquiries.phone,
    })
    .from(inquiries)
    .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
    .leftJoin(leadSubsources, eq(inquiries.subSourceId, leadSubsources.id))
    .where(eq(inquiries.metaLeadId, id))
    .limit(1);
  return row;
}

describe("ingestMetaLeadgenWebhook", () => {
  beforeEach(async () => {
    await ensureSystemUser();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const ids = createdLeadIds.splice(0);
    for (const metaLeadId of ids) {
      const rows = await db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.metaLeadId, metaLeadId));
      for (const row of rows) {
        await db.delete(inquiryActivities).where(eq(inquiryActivities.inquiryId, row.id));
        await db.delete(inquiries).where(eq(inquiries.id, row.id));
      }
    }
  });

  it("opens an inquiry as Facebook / Instant Forms / New", async () => {
    const id = leadId();
    stubLead(id, [
      { name: "full_name", values: ["Asha Singh"] },
      { name: "email", values: [`instant-${id}@test.invalid`] },
      { name: "phone_number", values: [phone()] },
      { name: "meal_plan", values: ["Veg"] },
    ]);

    const res = await ingestMetaLeadgenWebhook(webhook(id), null);
    expect(res).toEqual({ ok: true, ingested: 1 });

    const row = await saved(id);
    expect(row?.fullName).toBe("Asha Singh");
    expect(row?.source).toBe("facebook");
    expect(row?.subSource).toBe("instant_forms");
    expect(row?.subLabel).toBe("Instant Forms");
    expect(row?.stage).toBe("new");
    expect(row?.subStatus).toBeNull();
    expect(row?.notes).toContain("meal plan: Veg");
  });
});
