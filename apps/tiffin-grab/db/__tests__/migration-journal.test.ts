import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import journal from "../migrations/meta/_journal.json";

// drizzle's migrator only runs journal entries whose `when` is later than the newest
// created_at already recorded in the DB — a migration stamped earlier is skipped
// silently on deploy. Hand-edited/renumbered `when`s make that easy to hit.
// 0027 landed out of order before this guard; prod already applied it.
const GRANDFATHERED = new Set(["0027_add_plans_restricted"]);

describe("migration journal", () => {
  it("has strictly increasing `when` so no migration is skipped", () => {
    const outOfOrder = journal.entries
      .filter((e, i) => i > 0 && !GRANDFATHERED.has(e.tag) && e.when <= journal.entries[i - 1]!.when)
      .map((e) => e.tag);
    expect(outOfOrder).toEqual([]);
  });

  it("has a SQL file for every entry", () => {
    const dir = join(__dirname, "../migrations");
    expect(journal.entries.filter((e) => !existsSync(join(dir, `${e.tag}.sql`))).map((e) => e.tag)).toEqual([]);
  });
});
