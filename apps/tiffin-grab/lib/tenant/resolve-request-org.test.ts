import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { headers } from "next/headers";
import { resolveRequestOrg } from "./resolve-request-org";

describe("resolveRequestOrg", () => {
  it("returns the org id from the x-realm-org-id header", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-realm-org-id": "org_abc123" }) as never);
    expect(await resolveRequestOrg()).toBe("org_abc123");
  });

  it("returns null when the header is absent", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers() as never);
    expect(await resolveRequestOrg()).toBeNull();
  });

  it("rethrows Next static bailout errors instead of returning brand", async () => {
    const err = Object.assign(new Error("bailout"), { code: "NEXT_STATIC_GEN_BAILOUT" });
    vi.mocked(headers).mockRejectedValue(err);
    await expect(resolveRequestOrg()).rejects.toBe(err);
  });

  it("returns null for a plain error outside a request", async () => {
    vi.mocked(headers).mockRejectedValue(new Error("headers was called outside a request scope"));
    expect(await resolveRequestOrg()).toBeNull();
  });
});
