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
});
