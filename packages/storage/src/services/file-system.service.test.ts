import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorageProvider } from "../storage/memory-provider";
import type { Database } from "@realm/database";
import { FileSystemService } from "./file-system.service";

const url = process.env.DATABASE_URL;
const client = postgres(url ?? "");
const db = drizzle(client) as unknown as Database;

describe.skipIf(!url)("FileSystemService (integration)", () => {
  let storage: MemoryStorageProvider;
  let svc: FileSystemService;

  beforeAll(async () => {
    await client`create table if not exists files_file_system (
      id bigint primary key default next_id(),
      public_id text not null unique,
      created_at bigint not null default 0,
      created_by bigint,
      updated_at bigint not null default 0,
      updated_by bigint,
      resource_type text not null default 'static',
      name text not null,
      file_type text not null default 'file',
      size bigint,
      parent_id bigint references files_file_system(id) on delete cascade,
      path text not null default ''
    )`;
  });

  beforeEach(async () => {
    await client`truncate table files_file_system restart identity cascade`;
    storage = new MemoryStorageProvider();
    svc = new FileSystemService(storage, db, { publicBaseUrl: "https://cdn.test" });
  });

  afterAll(async () => {
    // Do NOT drop: files_file_system is real migrated schema shared with the app.
    // Leave it empty (truncate runs per test); dropping it would break the app DB.
    await client`truncate table files_file_system restart identity cascade`;
    await client.end();
  });

  it("create stores the object and returns a FileDetail with a static url", async () => {
    const fd = await svc.create("menu/dish/a.png", new TextEncoder().encode("img"), {
      contentType: "image/png",
    });
    expect(fd).toMatchObject({ name: "a.png", fileName: "a", type: "png", size: 3, isDirectory: false });
    expect(fd.url).toBe("https://cdn.test/menu/dish/a.png");
    expect((await storage.head("menu/dish/a.png"))?.size).toBe(3);
  });

  it("create builds a directory row chain, list returns children", async () => {
    await svc.create("menu/dish/a.png", "x");
    await svc.create("menu/dish/b.png", "y");
    const listed = await svc.list("menu/dish");
    expect(listed.map((f) => f.name).sort()).toEqual(["a.png", "b.png"]);
    const roots = await svc.list("");
    expect(roots.map((f) => f.name)).toEqual(["menu"]);
    expect(roots[0]?.isDirectory).toBe(true);
  });

  it("head on a directory returns no url", async () => {
    await svc.create("menu/dish/a.png", "x");
    const fd = await svc.head("menu/dish");
    expect(fd?.isDirectory).toBe(true);
    expect(fd?.url).toBeUndefined();
  });

  it("list on a non-existent directory returns empty, not the root listing", async () => {
    await svc.create("menu/dish/a.png", "x");
    expect(await svc.list("does/not/exist")).toEqual([]);
  });

  it("keyPrefix namespaces created objects so static stays CDN-safe apart from secured", async () => {
    const pub = new FileSystemService(storage, db, { publicBaseUrl: "https://cdn.test", keyPrefix: "public" });
    const fd = await pub.create("tickets/t1/n1/thumb-a.png", "x", { contentType: "image/png" });
    // physical key + url both carry the prefix; a "public/*" CDN scope covers it,
    // while a secured object written elsewhere (e.g. tickets/t1/n1/orig-a.png) does not.
    expect(fd.filePath).toBe("public/tickets/t1/n1/thumb-a.png");
    expect(fd.url).toBe("https://cdn.test/public/tickets/t1/n1/thumb-a.png");
    expect(await storage.head("public/tickets/t1/n1/thumb-a.png")).not.toBeNull();
    // reads round-trip on the stored (prefixed) path
    expect((await pub.head("public/tickets/t1/n1/thumb-a.png"))?.filePath).toBe("public/tickets/t1/n1/thumb-a.png");
  });

  it("delete removes the object and the row", async () => {
    await svc.create("x/a.png", "v");
    await svc.delete("x/a.png");
    expect(await storage.head("x/a.png")).toBeNull();
    expect(await svc.head("x/a.png")).toBeNull();
  });
});
