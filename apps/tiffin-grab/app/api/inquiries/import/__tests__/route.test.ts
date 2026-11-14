import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db/client";
import { ensureSystemUser } from "@/db/test-helpers";
import { inquiries } from "@/db/schema";
import { insertTestInquiry, resetInquiryData } from "@/lib/inquiries/__tests__/helpers/inquiry-fixtures";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/guards", () => ({ requireStaff: async () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { POST } = await import("../route");

function upload(rows: Record<string, string>[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Leads");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const form = new FormData();
  form.set("file", new File([bytes], "leads.xlsx"));
  form.set("sheet", "Leads");
  form.set("mapping", JSON.stringify({ date: "Date", phone: "Phone", fullName: "Name", stage: "Stage", notes: [] }));
  return new Request("http://localhost/api/inquiries/import", { method: "POST", body: form });
}

const row = async (id: bigint) => (await db.select().from(inquiries).where(eq(inquiries.id, id)))[0];

describe("POST /api/inquiries/import", () => {
  beforeEach(async () => {
    await resetInquiryData();
    await ensureSystemUser();
  });
  afterAll(resetInquiryData);

  it("creates, folds and reopens; back-dates only created rows; skips the stage branch on folds", async () => {
    const open = await insertTestInquiry({ phone: "+16475551601", stage: "contacted", subStatus: "responded" });
    const lost = await insertTestInquiry({ phone: "+16475551602", stage: "lost", subStatus: "lost" });
    const res = await POST(
      upload([
        { Date: "2026-01-05", Phone: "6475551600", Name: "New Person", Stage: "" },
        { Date: "2026-01-06", Phone: "6475551601", Name: "Open Person", Stage: "lost" },
        { Date: "2026-01-07", Phone: "6475551602", Name: "Lost Person", Stage: "" },
      ]),
    );
    const body = await res.json();
    expect(body).toMatchObject({ created: 1, matched: 1, reopened: 1 });
    expect((await row(open.id)).createdAt).toBe(open.createdAt);
    expect((await row(open.id)).stage).toBe("contacted");
    expect((await row(lost.id)).stage).toBe("new");
    const [fresh] = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475551600"));
    expect(fresh.createdAt).toBe(new Date("2026-01-05").getTime());
  });
});
