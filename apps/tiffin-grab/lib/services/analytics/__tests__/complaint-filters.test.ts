import { describe, expect, it } from "vitest";
import {
  COMPLAINT_CATEGORIES,
  NOT_LINKED,
  STATUS_OPTIONS,
  complaintHref,
  parseComplaintFilters,
} from "../complaint-filters";
import { TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";

describe("parseComplaintFilters", () => {
  it("reads comma-separated multi values and a numeric date range", () => {
    const f = parseComplaintFilters({
      from: "1000",
      to: "2000",
      category: "delivery,packaging",
      status: "new,open",
      priority: "urgent",
    });
    expect(f).toMatchObject({
      from: 1000,
      to: 2000,
      categories: ["delivery", "packaging"],
      statuses: ["new", "open"],
      priorities: ["urgent"],
    });
  });

  it("ignores categories that are not real, so a crafted URL can't widen the query", () => {
    expect(parseComplaintFilters({ category: "delivery,nonsense" }).categories).toEqual(["delivery"]);
  });

  it("treats blanks and junk dates as absent rather than zero", () => {
    const f = parseComplaintFilters({ from: "", to: "abc", category: " , ,delivery" });
    expect(f.from).toBeUndefined();
    expect(f.to).toBeUndefined();
    expect(f.categories).toEqual(["delivery"]);
  });

  it("defaults to no filters at all", () => {
    const f = parseComplaintFilters({});
    expect(f).toEqual({
      from: undefined,
      to: undefined,
      categories: [], subcategories: [], statuses: [], priorities: [], plans: [], zones: [],
    });
  });
});

describe("complaintHref", () => {
  it("round-trips through parseComplaintFilters, so a drill-through lands on the same scope", () => {
    const filters = parseComplaintFilters({
      from: "5", to: "9", category: "delivery", subcategory: "late_delivery",
      status: "open", priority: "high", plan: "veg", zone: "Downtown",
    });
    const href = complaintHref("/dashboard/tickets", filters);
    const back = parseComplaintFilters(
      Object.fromEntries(new URL(href, "http://x").searchParams) as Record<string, string>,
    );
    expect(back).toEqual(filters);
  });

  it("omits empty values instead of emitting bare keys", () => {
    expect(complaintHref("/dashboard/tickets", parseComplaintFilters({}))).toBe("/dashboard/tickets");
  });
});

describe("what counts as a complaint", () => {
  it("excludes Feedback & Suggestions, so compliments don't inflate the rate", () => {
    expect(COMPLAINT_CATEGORIES).not.toContain("feedback");
  });

  it("counts every other category", () => {
    for (const c of TICKET_CATEGORIES) {
      if (c === "feedback") continue;
      expect(COMPLAINT_CATEGORIES).toContain(c);
    }
  });
});

describe("status options", () => {
  it("offers New on top of the five stored statuses", () => {
    expect(STATUS_OPTIONS.map((s) => s.value)).toEqual([
      "new", "open", "in_progress", "waiting_on_customer", "resolved", "closed",
    ]);
  });
});

describe("unlinked bucket", () => {
  it("uses a sentinel that cannot collide with a real plan key or zone name", () => {
    // Zone names and plan keys are user-entered; the sentinel is deliberately
    // not a plausible one.
    expect(NOT_LINKED.startsWith("__")).toBe(true);
  });
});
