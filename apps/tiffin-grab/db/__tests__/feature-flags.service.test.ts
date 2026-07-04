import { UpdatableRepository, UpdatableService } from "@realm/database";
import { ValidationError } from "@realm/commons";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../client";
import { featureFlags } from "../schema";

// Targets the generic UpdatableService (strip managed fields, sort validation)
// over a real table — deliberately NOT the app's session-aware service, which
// pulls the server-side auth import chain that vitest can't resolve.
const service = new UpdatableService(new UpdatableRepository(db, featureFlags, featureFlags.publicId, featureFlags.id));

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
      id: 11111111n,
      publicId: "flg_client_supplied",
      createdBy: 22222222n,
    });
    expect(created.id).not.toBe(11111111n);
    expect(created.publicId).not.toBe("flg_client_supplied");
    expect(created.publicId).toMatch(/^flg_[0-9A-Za-z_-]{12}$/);
    expect(created.createdBy).toBeNull();
  });

  it("does not reassign createdAt/createdBy on update", async () => {
    const created = await service.create({ key: "u", label: "U", defaultEnabled: false });
    const updated = await service.update(created.publicId, {
      defaultEnabled: true,
      createdBy: 33333333n,
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
