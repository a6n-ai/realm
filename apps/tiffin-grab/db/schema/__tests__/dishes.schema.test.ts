import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dishes } from "../catalog";

describe("dishes schema", () => {
  it("no longer has a slots column (vestigial, replaced by dish_categories)", () => {
    const columns = getTableColumns(dishes);
    expect("slots" in columns).toBe(false);
  });
});
