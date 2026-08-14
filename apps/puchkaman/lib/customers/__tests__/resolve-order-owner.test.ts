import { describe, expect, it, vi } from "vitest";
import { resolveOrderOwner, type OrderOwnerDeps } from "../upsert-customer";

function deps(over: Partial<OrderOwnerDeps> = {}): OrderOwnerDeps {
  return {
    findByPublicId: vi.fn(async () => 42n),
    upsertByEmail: vi.fn(async () => 7n),
    ...over,
  };
}

describe("resolveOrderOwner", () => {
  it("prefers the signed-in customer over the typed email", async () => {
    const d = deps();
    const id = await resolveOrderOwner(
      { email: "typed@example.com", sessionUserPublicId: "usr_abc" },
      d,
    );
    expect(id).toBe(42n);
    expect(d.upsertByEmail).not.toHaveBeenCalled();
  });

  it("falls back to the email upsert for a guest", async () => {
    const d = deps();
    const id = await resolveOrderOwner({ email: "guest@example.com" }, d);
    expect(id).toBe(7n);
    expect(d.findByPublicId).not.toHaveBeenCalled();
  });

  it("falls back to the email upsert when the session points at a deleted row", async () => {
    const d = deps({ findByPublicId: vi.fn(async () => null) });
    const id = await resolveOrderOwner(
      { email: "guest@example.com", sessionUserPublicId: "usr_gone" },
      d,
    );
    expect(id).toBe(7n);
  });
});
