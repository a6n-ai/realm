import { describe, expect, it } from "vitest";
import { resolve } from "./routes";

describe("resolve", () => {
  it("substitutes a dynamic segment", () => {
    expect(resolve({ path: "/x/[id]", label: "x-detail", params: { id: "7" } })).toBe("/x/7");
  });

  it("returns a no-param route unchanged", () => {
    expect(resolve({ path: "/dashboard", label: "dashboard-overview" })).toBe("/dashboard");
  });
});
