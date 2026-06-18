import { UpdatableRepository, UpdatableService } from "@tiffin/commons-drizzle";
import { ValidationError } from "@tiffin/commons";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../client";
import { featureFlags } from "../schema";

// Targets the generic UpdatableService (strip managed fields, sort validation)
// over a real table — deliberately NOT the app's session-aware service, which
// pulls the next-auth/next-server import chain that vitest can't resolve.
const service = new UpdatableService(new UpdatableRepository(db, featureFlags, featureFlags.id));

describe("UpdatableService hardening (integration over feature_flags)", () => {
  beforeEach(async () => {
    await db.delete(featureFlags);
  });
  afterAll(async () => {
    await db.delete(featureFlags);
  });

  it("ignores client-supplied identity/audit fields (no mass assignment)", async () => {
    const created = await service.create({
      key: "ma",
      label: "Mass Assign",
      defaultEnabled: false,
      id: "11111111-1111-1111-1111-111111111111",
      createdBy: "22222222-2222-2222-2222-222222222222",
    });
    expect(created.id).not.toBe("11111111-1111-1111-1111-111111111111");
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdBy).toBeNull();
  });

  it("does not reassign createdAt/createdBy on update", async () => {
    const created = await service.create({ key: "u", label: "U", defaultEnabled: false });
    const updated = await service.update(created.id, {
      defaultEnabled: true,
      createdBy: "33333333-3333-3333-3333-333333333333",
    });
    expect(updated.createdBy).toBeNull();
    expect(updated.defaultEnabled).toBe(true);
  });

  it("rejects an unknown sort field with ValidationError (400)", async () => {
    await expect(
      service.list(undefined, { page: 0, size: 10, sort: { field: "nope", dir: "asc" } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
