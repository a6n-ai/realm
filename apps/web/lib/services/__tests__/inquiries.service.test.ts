import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";

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
    const inq = await inquiriesService.create({ fullName: "Lead A", phone: "+16475551000", source: "facebook" });
    const acts = await inquiriesService.listActivities(inq.id);
    expect(acts).toHaveLength(1);
    expect(acts[0].type).toBe("created");
  });

  it("changeStage updates stage and logs from/to", async () => {
    const inq = await inquiriesService.create({ fullName: "Lead B", phone: "+16475551001" });
    await inquiriesService.changeStage(inq.id, "contacted");
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.stage).toBe("contacted");
    const acts = await inquiriesService.listActivities(inq.id);
    const change = acts.find((a) => a.type === "stage_change");
    expect(change?.fromStage).toBe("new");
    expect(change?.toStage).toBe("contacted");
  });

  it("addNote appends a note activity", async () => {
    const inq = await inquiriesService.create({ fullName: "Lead C", phone: "+16475551002" });
    await inquiriesService.addNote(inq.id, "Called, no answer");
    const acts = await inquiriesService.listActivities(inq.id);
    expect(acts.some((a) => a.type === "note" && a.note === "Called, no answer")).toBe(true);
  });
});
