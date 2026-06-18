import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../client";
import { featureFlags } from "../schema";

const repo = new UpdatableRepository(db, featureFlags, featureFlags.id);

describe("feature_flags repository (integration)", () => {
  beforeEach(async () => {
    await db.delete(featureFlags);
  });
  afterAll(async () => {
    await db.delete(featureFlags);
  });

  it("creates and reads a flag with audit + uuid id", async () => {
    const created = await repo.create({ key: "beta_wizard", label: "Beta Wizard", defaultEnabled: false }, null);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdAt).toBeInstanceOf(Date);
    const read = await repo.findById(created.id);
    expect(read?.key).toBe("beta_wizard");
  });

  it("updates and bumps updatedAt", async () => {
    const created = await repo.create({ key: "k", label: "K", defaultEnabled: false }, null);
    const updated = await repo.update(created.id, { defaultEnabled: true }, null);
    expect(updated?.defaultEnabled).toBe(true);
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it("deletes", async () => {
    const created = await repo.create({ key: "d", label: "D", defaultEnabled: false }, null);
    expect(await repo.delete(created.id)).toBe(1);
    expect(await repo.findById(created.id)).toBeNull();
  });
});
