import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { like } from "drizzle-orm";
import { and, eq as cEq, like as cLike } from "@realm/commons/model/condition";
import { db } from "@/db/client";
import { inquiries, leadSources } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { inquiriesService } = await import("../inquiries.service");

// Test-isolation (repo convention): tag rows with a unique per-run id, assert on
// those only, clean up by that id — do NOT global-wipe users/inquiries (FK + races).
const RUN = `list_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
const scoped = (extra?: Parameters<typeof and>[number]) =>
  extra
    ? and(cLike("fullName", `${RUN}%`), extra)
    : and(cLike("fullName", `${RUN}%`));

let sourceKey = "";
let sourceLabel = "";

describe("inquiriesService.list (server-side filter + pagination)", () => {
  beforeAll(async () => {
    const [src] = await db
      .select({ id: leadSources.id, key: leadSources.key, label: leadSources.label })
      .from(leadSources)
      .limit(1);
    if (!src) throw new Error("no lead source seeded — cannot run inquiries-list test");
    sourceKey = src.key;
    sourceLabel = src.label;
    // 2 converted + 1 lost, all tagged with RUN so the assertions stay scoped.
    await db.insert(inquiries).values([
      { fullName: `${RUN}_a`, phone: `${RUN}_1`, sourceId: src.id, stage: "converted" },
      { fullName: `${RUN}_b`, phone: `${RUN}_2`, sourceId: src.id, stage: "converted" },
      { fullName: `${RUN}_c`, phone: `${RUN}_3`, sourceId: src.id, stage: "lost" },
    ]);
  });

  afterAll(async () => {
    await db.delete(inquiries).where(like(inquiries.fullName, `${RUN}%`));
  });

  it("filters by stage and paginates with a correct total", async () => {
    const cond = scoped(cEq("stage", "converted"));
    const page = await inquiriesService.listForPipeline(cond, { page: 0, size: 1 }, { column: "created", dir: "desc" });
    expect(page.size).toBe(1);
    expect(page.page).toBe(0);
    expect(page.items.length).toBe(1);
    // Only the two RUN 'converted' rows match — total is the unpaginated count.
    expect(page.total).toBe(2);
    // PipelineRow shape (joined + derived), not a raw base-table select.
    const row = page.items[0];
    expect(row.stage).toBe("converted");
    expect(row.fullName.startsWith(RUN)).toBe(true);
    expect(row.source).toBe(sourceLabel); // joined leadSources.label
    expect(typeof row.overdue).toBe("boolean"); // derived
  });

  it("resolves the FK 'source' facet via subquery on the source key", async () => {
    // The base column resolver has no `source` column — only the joined list's
    // subquery resolver understands this facet field.
    const cond = scoped(cEq("source", sourceKey));
    const page = await inquiriesService.listForPipeline(cond, { page: 0, size: 25 }, { column: "created", dir: "desc" });
    expect(page.total).toBe(3);
    expect(page.items.every((r) => r.source === sourceLabel)).toBe(true);
  });

  it("returns the second page with the same total", async () => {
    const cond = scoped(cEq("stage", "converted"));
    const p1 = await inquiriesService.listForPipeline(cond, { page: 1, size: 1 }, { column: "created", dir: "desc" });
    expect(p1.page).toBe(1);
    expect(p1.total).toBe(2);
    expect(p1.items.length).toBe(1);
  });
});
