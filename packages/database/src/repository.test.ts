import { bigint, pgTable, text } from "drizzle-orm/pg-core";
import { getTableName, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makePublicId } from "./columns";
import { BaseRepository, UpdatableRepository } from "./repository";
import type { Database } from "./types";

// Throwaway table so the test owns its own schema and does not depend on app
// migrations or the DB-side next_id() helper.
const widgets = pgTable("commons_repo_test_widgets", {
  id: bigint("id", { mode: "bigint" }).primaryKey(),
  publicId: text("public_id").notNull().unique().$defaultFn(makePublicId("wdg")),
  label: text("label").notNull(),
  updatedBy: bigint("updated_by", { mode: "bigint" }),
});

const url = process.env.DATABASE_URL;
const client = postgres(url ?? "");
const db = drizzle(client) as unknown as Database;

const repo = new UpdatableRepository(db, widgets, widgets.publicId, widgets.id);
const baseRepo = new BaseRepository(db, widgets, widgets.publicId, widgets.id);

let seq = 0n;
function makeRow(label: string) {
  seq += 1n;
  return { id: seq, label };
}

describe.skipIf(!url)("repository public-id boundary (integration)", () => {
  beforeAll(async () => {
    await client`create table if not exists commons_repo_test_widgets (
      id bigint primary key,
      public_id text not null unique,
      label text not null,
      updated_by bigint
    )`;
  });

  beforeEach(async () => {
    seq = 0n;
    await db.delete(widgets);
  });

  afterAll(async () => {
    await client`drop table if exists commons_repo_test_widgets`;
    await client.end();
  });

  it("findByPublicId returns the row keyed on public_id", async () => {
    const created = await repo.create(makeRow("alpha"));
    expect(created.publicId).toMatch(/^wdg_/);

    const found = await repo.findByPublicId(created.publicId);
    expect(found?.label).toBe("alpha");
    expect(found?.id).toBe(created.id);

    expect(await repo.findByPublicId("wdg_does_not_____")).toBeNull();
  });

  it("findById keys on the internal bigint for joins", async () => {
    const created = await repo.create(makeRow("beta"));
    const found = await baseRepo.findById(created.id);
    expect(found?.publicId).toBe(created.publicId);
  });

  it("list orders by the internal id ascending, not the random public_id", async () => {
    // Insert in non-sequential public-id order; internal ids are 1,2,3.
    await repo.create(makeRow("first"));
    await repo.create(makeRow("second"));
    await repo.create(makeRow("third"));

    const page = await repo.findMany(undefined, { page: 0, size: 10 });
    expect(page.items.map((r) => r.label)).toEqual(["first", "second", "third"]);
    expect(page.items.map((r) => r.id)).toEqual([1n, 2n, 3n]);
  });

  it("deleteByPublicId removes the row addressed by public_id", async () => {
    const keep = await repo.create(makeRow("keep"));
    const drop = await repo.create(makeRow("drop"));

    expect(await repo.deleteByPublicId(drop.publicId)).toBe(1);
    expect(await repo.findByPublicId(drop.publicId)).toBeNull();
    expect(await repo.findByPublicId(keep.publicId)).not.toBeNull();
    expect(await repo.deleteByPublicId("wdg_missing______")).toBe(0);
  });

  it("updateByPublicId patches by public_id and stamps the bigint actor", async () => {
    const created = await repo.create(makeRow("old"));
    const actor = 99n;

    const updated = await repo.updateByPublicId(created.publicId, { label: "new" }, actor);
    expect(updated?.label).toBe("new");
    expect(updated?.updatedBy).toBe(actor);

    expect(await repo.updateByPublicId("wdg_missing______", { label: "x" })).toBeNull();
  });
});

it("exposes the underlying table name", () => {
  const repo = new BaseRepository(db, widgets, widgets.publicId, widgets.id);
  expect(repo.tableName).toBe(getTableName(widgets));
});
