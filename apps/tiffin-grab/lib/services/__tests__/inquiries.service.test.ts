import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";
import { ValidationError } from "@tiffin/commons";

// Session services transitively evaluate NextAuth(); stub it for the node env.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { inquiriesService } = await import("../inquiries.service");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}

describe("inquiriesService", () => {
  beforeEach(reset);
  afterAll(reset);

  it("create writes a 'created' activity", async () => {
    const inq = await inquiriesService.create({ fullName: "Lead A", phone: "+16475551000", sourceKey: "facebook" });
    const acts = await inquiriesService.listActivities(inq.publicId);
    expect(acts).toHaveLength(1);
    expect(acts[0].type).toBe("created");
  });

  it("changeStage updates stage and logs from/to", async () => {
    const inq = await inquiriesService.create({ fullName: "Lead B", phone: "+16475551001", sourceKey: "manual" });
    await inquiriesService.changeStage(inq.publicId, "contacted");
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.stage).toBe("contacted");
    const acts = await inquiriesService.listActivities(inq.publicId);
    const change = acts.find((a) => a.type === "stage_change");
    expect(change?.fromStage).toBe("new");
    expect(change?.toStage).toBe("contacted");
  });

  it("addNote appends a note activity", async () => {
    const inq = await inquiriesService.create({ fullName: "Lead C", phone: "+16475551002", sourceKey: "manual" });
    await inquiriesService.addNote(inq.publicId, "Called, no answer");
    const acts = await inquiriesService.listActivities(inq.publicId);
    expect(acts.some((a) => a.type === "note" && a.note === "Called, no answer")).toBe(true);
  });

  it("rejects an invalid phone", async () => {
    await expect(
      inquiriesService.create({ fullName: "X", phone: "12", sourceKey: "manual" }),
    ).rejects.toThrow(/phone/i);
  });

  it("stores phone as E.164", async () => {
    const inq = await inquiriesService.create({ fullName: "X", phone: "647 555 0100", sourceKey: "manual" });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.publicId, inq.publicId));
    expect(row.phone).toBe("+16475550100");
  });
});
