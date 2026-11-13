// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_TABLE_COLUMNS,
  PLAN_TABLE_STORAGE_KEY,
  loadPlanTableColumns,
  normalizePlanTableColumns,
  savePlanTableColumns,
} from "../renewal-table-columns";

afterEach(() => {
  localStorage.removeItem(PLAN_TABLE_STORAGE_KEY);
});

describe("normalizePlanTableColumns", () => {
  it("defaults when empty or unknown-only", () => {
    expect(normalizePlanTableColumns([])).toEqual(DEFAULT_PLAN_TABLE_COLUMNS);
    expect(normalizePlanTableColumns(null)).toEqual(DEFAULT_PLAN_TABLE_COLUMNS);
    expect(normalizePlanTableColumns(["bogus"])).toEqual(DEFAULT_PLAN_TABLE_COLUMNS);
  });

  it("keeps catalog order, forces required, drops unknown", () => {
    expect(normalizePlanTableColumns(["notes", "track", "phone", "customer"])).toEqual([
      "customer",
      "phone",
      "track",
      "actions",
    ]);
  });

  it("matches today's desk defaults", () => {
    expect(DEFAULT_PLAN_TABLE_COLUMNS).toEqual([
      "customer",
      "mealSize",
      "last",
      "outcome",
      "coins",
      "spent",
      "total",
      "actions",
    ]);
  });
});

describe("load/savePlanTableColumns", () => {
  it("falls back to defaults for corrupt storage", () => {
    localStorage.setItem(PLAN_TABLE_STORAGE_KEY, "{not-json");
    expect(loadPlanTableColumns()).toEqual(DEFAULT_PLAN_TABLE_COLUMNS);
    localStorage.setItem(PLAN_TABLE_STORAGE_KEY, JSON.stringify({ v: 2, on: ["phone"] }));
    expect(loadPlanTableColumns()).toEqual(DEFAULT_PLAN_TABLE_COLUMNS);
  });

  it("round-trips a valid preference", () => {
    const saved = savePlanTableColumns(["phone", "track", "customer"]);
    expect(saved).toEqual(["customer", "phone", "track", "actions"]);
    expect(loadPlanTableColumns()).toEqual(saved);
  });
});
