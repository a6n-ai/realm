import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSystemUser } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadCounters } from "@/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/guards", () => ({ requireStaff: async () => undefined }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { quickAddInquiries } = await import("../actions");
const { inquiriesService } = await import("@/lib/services/inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(leadCounters);
}

describe("quickAddInquiries", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("folds known numbers", async () => {
    await inquiriesService.create({ fullName: "Known", phone: "+16475553001", sourceKey: "facebook" });
    const res = await quickAddInquiries({ text: "+16475553001\n+16475553002\n+16475553002", sourceKey: "facebook" });
    expect(res).toMatchObject({ ok: true, added: 1, folded: 1, failed: [] });
    const rows = await db.select().from(inquiries);
    expect(rows.find((r) => r.phone === "+16475553002")?.fullName).toMatch(/^Lead \d+$/);
  });

  it("reports invalid numbers without failing the batch", async () => {
    const res = await quickAddInquiries({ text: "+16475553003\nabc", sourceKey: "facebook" });
    expect(res).toMatchObject({ ok: true, added: 1, folded: 0, failed: [{ phone: "abc", error: "Enter a valid phone number" }] });
  });

  it("rejects an empty paste and more than 200 numbers", async () => {
    expect(await quickAddInquiries({ text: "  ", sourceKey: "facebook" })).toHaveProperty("error");
    const many = Array.from({ length: 201 }, (_, i) => `+1647556${String(i).padStart(4, "0")}`).join("\n");
    expect(await quickAddInquiries({ text: many, sourceKey: "facebook" })).toMatchObject({ error: "Paste at most 200 numbers at a time" });
  });
});
