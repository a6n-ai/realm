import { describe, expect, it } from "vitest";
import { PUBLIC_API } from "@/proxy";

describe("/api/health access", () => {
  it("is reachable without signing in", () => {
    expect(PUBLIC_API).toContain("/api/health");
  });
});
