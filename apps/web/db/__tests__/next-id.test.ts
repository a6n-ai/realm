import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("next_id()", () => {
  it("returns monotonic, unique, increasing bigints", async () => {
    const rows = await db.execute<{ id: string }>(sql`SELECT next_id() AS id FROM generate_series(1, 500)`);
    const ids = rows.map((r) => BigInt(r.id));
    expect(new Set(ids.map(String)).size).toBe(500);
    for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
  });

  it("encodes the custom epoch (id >> 23 ≈ ms since 2025-01-01)", async () => {
    const [{ id }] = await db.execute<{ id: string }>(sql`SELECT next_id() AS id`);
    const msSinceEpoch = Number(BigInt(id) >> 23n);
    const wallMsSinceEpoch = Date.now() - 1735689600000;
    expect(Math.abs(wallMsSinceEpoch - msSinceEpoch)).toBeLessThan(5000);
  });
});
