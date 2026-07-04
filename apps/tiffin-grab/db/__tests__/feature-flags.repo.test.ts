import { UpdatableRepository } from "@realm/commons-drizzle";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../client";
import { featureFlags } from "../schema";

const repo = new UpdatableRepository(db, featureFlags, featureFlags.publicId, featureFlags.id);

describe("feature_flags repository (integration)", () => {
  beforeEach(async () => {
    await db.delete(featureFlags);
  });
  afterAll(async () => {
    await db.delete(featureFlags);
  });

  it("creates and reads a flag with audit + public id", async () => {
    const created = await repo.create({ key: "beta_wizard", label: "Beta Wizard", defaultEnabled: false }, null);
    expect(created.publicId).toMatch(/^flg_[0-9A-Za-z_-]{12}$/);
    expect(typeof created.createdAt).toBe("number");
    const read = await repo.findByPublicId(created.publicId);
    expect(read?.key).toBe("beta_wizard");
  });

  it("updates and bumps updatedAt", async () => {
    const created = await repo.create({ key: "k", label: "K", defaultEnabled: false }, null);
    const updated = await repo.updateByPublicId(created.publicId, { defaultEnabled: true }, null);
    expect(updated?.defaultEnabled).toBe(true);
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it("deletes", async () => {
    const created = await repo.create({ key: "d", label: "D", defaultEnabled: false }, null);
    expect(await repo.deleteByPublicId(created.publicId)).toBe(1);
    expect(await repo.findByPublicId(created.publicId)).toBeNull();
  });
});
